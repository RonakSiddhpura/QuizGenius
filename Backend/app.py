import os
import shutil
import time
import json
import re
from datetime import datetime, timedelta, timezone # Use timezone from datetime
from urllib.parse import quote_plus

import requests
from bs4 import BeautifulSoup
from bson import ObjectId
from dateutil import parser # Keep for flexible date string parsing
from dotenv import load_dotenv
from fake_useragent import UserAgent
from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_jwt_extended import (JWTManager, create_access_token,
                                get_jwt_identity, jwt_required)
from flask_pymongo import PyMongo
# --- Langchain / AI ---
import google.generativeai as genai
from langchain_community.vectorstores import FAISS
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
# --- Security ---
from werkzeug.security import check_password_hash, generate_password_hash
# --- Web Scraping Driver ---
import undetected_chromedriver as uc

# --- Load Environment Variables ---
load_dotenv()

# --- Constants ---
# Use the user's provided IST definition
IST = timezone(timedelta(hours=5, minutes=30))
FAISS_INDEX_DIR = "faiss_index"
# INDEX_FILE = f"{FAISS_INDEX_DIR}/index.faiss" # Not explicitly used later, but good to define

# --- Helper Functions ---
# Use the user's provided format_datetime function
def format_datetime(dt):
    if dt is None:
        return None
    # Function assumes dt might be naive or aware, converts to IST
    # Make sure dt is timezone-aware before converting
    if dt.tzinfo is None:
        # If naive, assume it's UTC (standard storage practice) before converting to IST
        dt = dt.replace(tzinfo=timezone.utc)
    # ist_tz = timezone(timedelta(hours=5, minutes=30)) # Redundant definition
    return dt.astimezone(IST).isoformat()

def parse_datetime_string(dt_str, dayfirst=False):
    """Parses a datetime string into a timezone-aware UTC datetime object."""
    if not dt_str:
        return None
    try:
        # Use dateutil.parser for flexibility
        parsed_dt = parser.parse(dt_str, dayfirst=dayfirst)

        # If the parsed datetime is naive...
        if parsed_dt.tzinfo is None or parsed_dt.tzinfo.utcoffset(parsed_dt) is None:
             # Assume the naive datetime represents IST (based on user context)
             # Make it IST-aware first
             aware_ist_dt = parsed_dt.replace(tzinfo=IST)
             # Convert to UTC for storage
             return aware_ist_dt.astimezone(timezone.utc)
        else:
             # If it's already timezone-aware, just convert to UTC
             return parsed_dt.astimezone(timezone.utc)
    except (ValueError, TypeError) as e:
        print(f"Error parsing date string '{dt_str}': {e}")
        return None

# Custom JSON encoder for MongoDB ObjectId and datetime
class MongoJSONEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, ObjectId):
            return str(obj)
        if isinstance(obj, datetime):
            # Use the user's provided format_datetime for outputting IST strings
            return format_datetime(obj)
        return super(MongoJSONEncoder, self).default(obj)

# --- Flask App Initialization ---
app = Flask(__name__)

# --- Configuration ---
app.config['MONGO_URI'] = os.getenv("MONGO_URI", "mongodb://localhost:27017/quiz_generator")
app.config['JWT_SECRET_KEY'] = os.getenv("JWT_SECRET_KEY", "your-super-secret-key")
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(days=int(os.getenv("JWT_ACCESS_TOKEN_EXPIRES_DAYS", 1)))
GENAI_API_KEY = os.getenv("GENAI_API_KEY")

if not GENAI_API_KEY:
    print("Warning: GENAI_API_KEY not found in environment variables.")
if not app.config['MONGO_URI']:
     print("Warning: MONGO_URI not found in environment variables.")
if app.config['JWT_SECRET_KEY'] == "your-super-secret-key":
     print("Warning: Using default JWT_SECRET_KEY. Please set a strong secret in .env")

# --- Extensions Initialization ---
CORS(app, origins=["http://localhost:5173"], supports_credentials=True, methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"])
jwt = JWTManager(app)
mongo = PyMongo(app)
app.json_encoder = MongoJSONEncoder # Use the custom encoder

# --- AI Model Initialization ---
# Ensure GENAI_API_KEY is loaded before configuring
if GENAI_API_KEY:
    genai.configure(api_key=GENAI_API_KEY)
else:
    # Handle the case where API key is missing - maybe raise an error or exit?
    print("FATAL ERROR: GENAI_API_KEY is not set. AI features will not work.")
    # Consider exiting or disabling AI routes if the key is essential
    # exit(1) # Uncomment to force exit if key is mandatory


# Ensure FAISS directory exists
if not os.path.exists(FAISS_INDEX_DIR):
    os.makedirs(FAISS_INDEX_DIR)

# --- Helper Functions (Scraping, RAG, AI) ---

def scrape_google_news(topic, num_articles=3):
    """Scrape Google News for articles on a given topic."""
    query = quote_plus(topic)
    url = f"https://news.google.com/search?q={query}&hl=en-IN&gl=IN&ceid=IN%3Aen"
    headers = {"User-Agent": UserAgent().random} # Use fake user agent
    news_list = []
    print(f"Scraping Google News for: {topic}")
    try:
        response = requests.get(url, headers=headers, timeout=15) # Add timeout
        response.raise_for_status()
        soup = BeautifulSoup(response.text, 'html.parser')
        articles = soup.find_all('article')

        count = 0
        for article in articles:
            if count >= num_articles:
                break
            try:
                # Find the link element more reliably
                link_elem = article.find('a', href=True)
                # Find the title - often within the link or in a sibling h3/h4
                title_elem = None
                if link_elem:
                     title_elem = link_elem.find(['h3', 'h4']) or article.find(['h3','h4'])

                if link_elem and title_elem:
                    title = title_elem.text.strip()
                    link = link_elem['href']
                    # Resolve relative URLs correctly
                    if link.startswith('./'):
                        link = "https://news.google.com" + link[1:]
                    # Add other potential base URLs if necessary, but news.google.com is primary
                    elif not link.startswith('http'):
                         link = "https://news.google.com" + link # Assume relative to news.google.com

                    if title and link.startswith('http'): # Ensure we have a title and valid link
                         news_list.append({'title': title, 'link': link})
                         count += 1
            except Exception as e:
                print(f"Error parsing article details: {e}")
                continue # Skip problematic articles
        print(f"Found {len(news_list)} news articles.")
        return news_list
    except requests.exceptions.RequestException as e:
        print(f"Error fetching Google News URL {url}: {e}")
        return []
    except Exception as e:
        print(f"Error processing Google News HTML: {e}")
        return []


def scrape_final_url_content(final_urls):
    """Scrape the content from each article URL using undetected_chromedriver."""
    content_list = []
    options = uc.ChromeOptions()
    options.add_argument("--headless")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument(f"--user-agent={UserAgent().random}") # Set random user agent
    driver = None

    print(f"Attempting to scrape content from {len(final_urls)} URLs...")
    try:
        # Specify driver executable path if needed, or let uc find it
        # driver = uc.Chrome(options=options, driver_executable_path='/path/to/chromedriver')
        driver = uc.Chrome(options=options)

        for url in final_urls:
            print(f"Scraping: {url}")
            try:
                driver.get(url)
                # Wait longer for dynamic content loading
                time.sleep(10) # Adjust as needed, 10-15s is often reasonable

                page_source = driver.page_source
                if not page_source or len(page_source) < 500:
                    print(f"Warning: Page source seems too short for {url}. Skipping.")
                    continue

                soup = BeautifulSoup(page_source, 'html.parser')

                # Enhanced content extraction: try common article tags first
                article_body = soup.find('article') or soup.find('main') or soup.find(role='main') or soup.find(class_=re.compile("post|article|content|body"))

                if not article_body:
                    # Fallback to body if specific tags fail
                    article_body = soup.find('body')
                    if not article_body:
                        print(f"Could not find main content area for {url}. Skipping.")
                        continue

                # Get paragraph texts within the identified content area
                paragraphs = article_body.find_all('p')
                content = '\n'.join([p.text.strip() for p in paragraphs if p.text.strip()])

                if len(content) > 150: # Increased minimum length check
                    print(f"Successfully extracted content from {url} (length: {len(content)})")
                    content_list.append(content)
                else:
                    print(f"Warning: Extracted content too short for {url}. Content: '{content[:50]}...'")

            except Exception as e:
                print(f"Error scraping individual URL {url}: {e}")
                continue
    except Exception as e:
         print(f"Error initializing or using the WebDriver: {e}")
    finally:
        if driver:
            try:
                driver.quit()
                print("WebDriver quit.")
            except Exception as e:
                print(f"Error quitting WebDriver: {e}")
    print(f"Extracted content from {len(content_list)} URLs.")
    return content_list


def get_vector_store(text_chunks, user_id):
    """Store text chunks in FAISS vector store for a specific user."""
    if not text_chunks:
        print("No text chunks provided to create vector store.")
        return False
    if not GENAI_API_KEY:
        print("Cannot get vector store: GENAI_API_KEY not configured.")
        return False

    user_index_dir = os.path.join(FAISS_INDEX_DIR, str(user_id))
    try:
        if not os.path.exists(user_index_dir):
            os.makedirs(user_index_dir)

        embeddings = GoogleGenerativeAIEmbeddings(model="models/embedding-001", google_api_key=GENAI_API_KEY)
        print(f"Creating FAISS index for user {user_id} at {user_index_dir}")
        vector_store = FAISS.from_texts(text_chunks, embedding=embeddings)
        vector_store.save_local(user_index_dir)
        print("FAISS index saved successfully.")
        return True
    except Exception as e:
        print(f"Error creating or saving FAISS index for user {user_id}: {e}")
        # Clean up potentially empty directory
        if os.path.exists(user_index_dir) and not os.listdir(user_index_dir):
             try: os.rmdir(user_index_dir)
             except OSError: pass
        return False

def retrieve_relevant_content(query, user_id):
    """Retrieve relevant content from user's vector store."""
    if not GENAI_API_KEY:
        print("Cannot retrieve relevant content: GENAI_API_KEY not configured.")
        return ""

    user_index_dir = os.path.join(FAISS_INDEX_DIR, str(user_id))
    user_index_file = os.path.join(user_index_dir, "index.faiss")

    if not os.path.exists(user_index_file):
        print(f"No FAISS index found for user {user_id} at {user_index_dir}")
        return ""

    try:
        embeddings = GoogleGenerativeAIEmbeddings(model="models/embedding-001", google_api_key=GENAI_API_KEY)
        print(f"Loading FAISS index for user {user_id} from {user_index_dir}")
        vector_store = FAISS.load_local(user_index_dir, embeddings, allow_dangerous_deserialization=True)
        docs = vector_store.similarity_search(query, k=3) # Get top 3
        print(f"Retrieved {len(docs)} relevant documents for query '{query}'")
        return "\n\n---\n\n".join([doc.page_content for doc in docs]) # Join with separator
    except Exception as e:
        print(f"Error loading or searching FAISS index for user {user_id}: {e}")
        return ""


def generate_ai_response(prompt):
    """Generate response using Google Gemini."""
    if not GENAI_API_KEY:
        print("Cannot generate AI response: GENAI_API_KEY not configured.")
        return None
    try:
        # Check model availability and choose appropriate one
        # model = ChatGoogleGenerativeAI(model="gemini-1.5-flash", google_api_key=GENAI_API_KEY, temperature=0.6)
        model = ChatGoogleGenerativeAI(model="gemini-2.0-flash", google_api_key=GENAI_API_KEY, temperature=0.6) # Fallback?
        print("Generating AI response...")
        response = model.invoke(prompt)
        print("AI response received.")
        return response
    except Exception as e:
        print(f"Error generating AI response: {e}")
        # Handle specific errors like API key issues, rate limits, model access etc. if possible
        return None


def format_quiz_response(response_text, num_mcqs):
    """
    Improved function to parse quiz questions from AI response (from original code).
    More robust to handle variations in formatting.
    """
    try:
        # First try the simpler pattern that worked in the example
        questions = []
        # Pattern that looks for "Question: ...", followed by options, followed by "Answer: X"
        # Updated regex to be slightly more forgiving with whitespace and optional colon
        matches = re.findall(
            r"Question:?\s*(.*?)\n\s*(a\).*?)\n\s*(b\).*?)\n\s*(c\).*?)\n\s*(d\).*?)\n\s*Answer:?\s*([a-d])",
            response_text,
            re.DOTALL | re.IGNORECASE # Added IGNORECASE
        )

        for idx, (question_text, opt_a, opt_b, opt_c, opt_d, answer_letter) in enumerate(matches):
             if len(questions) >= num_mcqs: break # Stop if enough questions found
             questions.append({
                 "question_number": len(questions) + 1,
                 "question": question_text.strip(),
                 "options": [opt_a.strip(), opt_b.strip(), opt_c.strip(), opt_d.strip()],
                 "correct_answer": answer_letter.strip().lower()
             })

        # If the simple pattern didn't find enough questions, try a more flexible approach
        if len(questions) < num_mcqs:
            print(f"Initial pattern found {len(questions)}/{num_mcqs}. Trying fallback parsing...")
            # Split by double newlines, potentially separating question blocks
            question_blocks = re.split(r'\n\s*\n+', response_text.strip())

            for block in question_blocks:
                if len(questions) >= num_mcqs: break # Stop if enough found

                lines = [line.strip() for line in block.strip().split('\n') if line.strip()]
                if len(lines) < 6: continue # Basic check for enough lines

                # Try to extract question, options, and answer from the block
                q_text = ""
                opts = []
                ans = ""

                # Find question (likely the first line)
                q_match = re.match(r'(?:Question:?\s*\d*\.?\s*)?(.*)', lines[0], re.IGNORECASE)
                if q_match:
                    q_text = q_match.group(1).strip()

                # Find options (lines starting with a/b/c/d)
                found_opts = {}
                for line in lines[1:]:
                    opt_match = re.match(r'\s*([a-d])\)\s*(.*)', line, re.IGNORECASE)
                    if opt_match:
                        letter = opt_match.group(1).lower()
                        text = opt_match.group(2).strip()
                        if letter not in found_opts: # Take the first match for each letter
                             found_opts[letter] = f"{letter}) {text}"
                # Ensure we have all 4 options
                if len(found_opts) == 4:
                    opts = [found_opts['a'], found_opts['b'], found_opts['c'], found_opts['d']]


                # Find answer (look for "Answer: letter" pattern, often last line)
                for line in reversed(lines): # Search from end
                    ans_match = re.search(r'Answer:?\s*([a-d])\.?\s*$', line, re.IGNORECASE)
                    if ans_match:
                        ans = ans_match.group(1).lower()
                        break # Found answer

                # Add if valid question found
                if q_text and len(opts) == 4 and ans:
                     # Avoid adding duplicates if somehow parsed twice
                     is_duplicate = any(q['question'] == q_text for q in questions)
                     if not is_duplicate:
                          questions.append({
                              "question_number": len(questions) + 1,
                              "question": q_text,
                              "options": opts,
                              "correct_answer": ans
                          })
                     else:
                          print(f"Skipping duplicate question during fallback: {q_text[:30]}...")


        print(f"Formatted {len(questions)} questions.")
        # If still not enough, log a warning
        if len(questions) < num_mcqs:
             print(f"Warning: Expected {num_mcqs} questions, but only parsed {len(questions)} after fallback.")
             # Log the response text that caused issues
             try:
                  with open("failed_parsing_response.txt", "w", encoding="utf-8") as f:
                       f.write(f"Expected: {num_mcqs}, Parsed: {len(questions)}\n\n")
                       f.write(response_text)
             except Exception as log_e:
                  print(f"Could not write failed parsing response log: {log_e}")


        return questions[:num_mcqs] # Return up to the number requested

    except Exception as e:
        print(f"Error parsing quiz response: {str(e)}")
        # Return an empty list if parsing fails critically
        return []

def update_topic_recommendations(user_id_str, topic):
    """Update user recommendations based on topic selection."""
    try:
        user_oid = ObjectId(user_id_str)
        # Use $addToSet to add topic if not present, $set to update timestamp
        # Use $slice to keep the array size limited (last 10)
        mongo.db.recommendations.update_one(
            {"user_id": user_oid},
            {
                "$addToSet": {"topics": topic},
                "$set": {"last_updated": datetime.now(timezone.utc)} # Store UTC
            },
            upsert=True # Create if doesn't exist
        )
        # After adding, ensure the list doesn't exceed 10 items (keep the newest)
        mongo.db.recommendations.update_one(
            {"user_id": user_oid},
            {"$push": {"topics": {"$each": [], "$slice": -10}}}
        )

        print(f"Updated recommendations for user {user_id_str}")
    except Exception as e:
        print(f"Error updating recommendations for user {user_id_str}: {e}")

def get_trending_topics():
    """Get trending topics from recent news (from original code)."""
    try:
        # Fetch top news stories
        url = "https://news.google.com/topstories?hl=en-IN&gl=IN&ceid=IN:en"
        headers = {"User-Agent": UserAgent().random} # Use random agent

        response = requests.get(url, headers=headers, timeout=10) # Add timeout
        response.raise_for_status() # Raise error for bad status
        soup = BeautifulSoup(response.text, 'html.parser')

        # Extract main topics
        topics = set()
        # Find article headlines (often in h3 or h4 within article tags)
        articles = soup.find_all('article', limit=20) # Limit to top 20 articles

        for article in articles:
            title_elem = article.find(['h3', 'h4']) # Look for h3 or h4
            if title_elem:
                title = title_elem.text.strip()
                # Extract potentially relevant keywords (longer words, capitalized often)
                # This is a very naive approach
                words = [w for w in title.split() if len(w) > 4 and w[0].isupper()]
                topics.update(words[:2]) # Add up to 2 potential keywords from each title

        # Filter out generic words if needed (add a stopword list)
        # Example: stop_words = {"Google", "News", "India", ...}
        # topics = {t for t in topics if t not in stop_words}

        trending = list(topics)[:10] # Return up to 10 topics
        print(f"Found trending topics: {trending}")
        # Provide fallback if scraping yields nothing
        if not trending:
             print("Scraping yielded no topics, using fallback.")
             return ["Technology", "Politics", "Sports", "Health", "Science", "Business"]
        return trending

    except Exception as e:
        print(f"Error fetching trending topics: {e}. Using fallback.")
        # Fallback to default topics
        return ["Technology", "Politics", "Sports", "Health", "Science", "India"]


# --- Authentication Routes ---
@app.route('/api/register', methods=['POST'])
def register():
    data = request.get_json()
    name = data.get('name')
    email = data.get('email')
    password = data.get('password')

    if not name or not email or not password:
        return jsonify({"error": "Name, email, and password are required"}), 400
    if not re.match(r"[^@]+@[^@]+\.[^@]+", email):
         return jsonify({"error": "Invalid email format"}), 400

    if mongo.db.users.find_one({"email": email.lower().strip()}): # Check lowercase email
        return jsonify({"error": "Email already registered"}), 400

    password_hash = generate_password_hash(password)

    try:
        user_id = mongo.db.users.insert_one({
            "name": name.strip(),
            "email": email.lower().strip(),
            "password_hash": password_hash,
            "role": "user",
            "created_at": datetime.now(timezone.utc) # Store UTC
        }).inserted_id

        access_token = create_access_token(identity=str(user_id))

        # Return user info consistent with login/get_user
        user_data = {
            "id": str(user_id),
            "name": name.strip(),
            "email": email.lower().strip(),
            "role": "user"
        }

        return jsonify({
            "message": "Registration successful",
            "access_token": access_token,
            "user": user_data
        }), 201
    except Exception as e:
        print(f"Error during registration: {e}")
        return jsonify({"error": "Registration failed due to server error"}), 500

@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')

    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400

    user = mongo.db.users.find_one({"email": email.lower().strip()}) # Use lowercase

    if not user or not check_password_hash(user.get('password_hash', ''), password):
        return jsonify({"error": "Invalid email or password"}), 401

    access_token = create_access_token(identity=str(user['_id']))

    user_data = {
        "id": str(user['_id']),
        "name": user.get('name'),
        "email": user.get('email'),
        "role": user.get('role', 'user')
    }

    return jsonify({
        "message": "Login successful",
        "access_token": access_token,
        "user": user_data
    }), 200

@app.route('/api/user', methods=['GET'])
@jwt_required()
def get_user():
    current_user_id_str = get_jwt_identity()
    try:
        user_oid = ObjectId(current_user_id_str)
    except Exception:
        return jsonify({"error": "Invalid user identity in token"}), 400

    user = mongo.db.users.find_one({"_id": user_oid}, {"password_hash": 0})

    if not user:
        return jsonify({"error": "User not found"}), 404

    # Let the custom JSON encoder handle formatting _id and created_at
    # No need to manually format here if returning the whole user dict

    return jsonify({"user": user}), 200

@app.route('/api/user/profile', methods=['PUT'])
@jwt_required()
def update_user_profile():
    current_user_id_str = get_jwt_identity()
    try:
        user_oid = ObjectId(current_user_id_str)
    except Exception:
        return jsonify({"error": "Invalid user identity"}), 400

    data = request.get_json()
    name = data.get('name', '').strip()
    email = data.get('email', '').lower().strip()

    update_fields = {}
    if not name:
        return jsonify({"error": "Name cannot be empty"}), 400
    update_fields['name'] = name

    if not email:
        return jsonify({"error": "Email cannot be empty"}), 400
    if not re.match(r"[^@]+@[^@]+\.[^@]+", email):
         return jsonify({"error": "Invalid email format"}), 400

    # Check if email is already used by ANOTHER user
    existing_user = mongo.db.users.find_one({"email": email, "_id": {"$ne": user_oid}})
    if existing_user:
        return jsonify({"error": "Email address is already in use by another account"}), 400
    update_fields['email'] = email

    update_fields["last_updated_at"] = datetime.now(timezone.utc)

    try:
        result = mongo.db.users.update_one(
            {"_id": user_oid},
            {"$set": update_fields}
        )

        if result.matched_count == 0:
            return jsonify({"error": "User not found (should not happen with JWT)"}), 404

        # Fetch updated user to potentially update context elsewhere (optional to return)
        updated_user = mongo.db.users.find_one({"_id": user_oid}, {"password_hash": 0})

        return jsonify({
            "message": "Profile updated successfully",
            "user": updated_user # Returning updated user is good practice
        }), 200

    except Exception as e:
        print(f"Error updating profile for user {user_oid}: {e}")
        return jsonify({"error": "Server error updating profile"}), 500

@app.route('/api/user/password', methods=['PUT'])
@jwt_required()
def change_password():
    current_user_id_str = get_jwt_identity()
    try:
        user_oid = ObjectId(current_user_id_str)
    except Exception:
        return jsonify({"error": "Invalid user identity"}), 400

    data = request.get_json()
    old_password = data.get('old_password')
    new_password = data.get('new_password')

    if not old_password or not new_password:
        return jsonify({"error": "Old and new passwords are required"}), 400
    if len(new_password) < 6:
         return jsonify({"error": "New password must be at least 6 characters long"}), 400

    user = mongo.db.users.find_one({"_id": user_oid})
    if not user: return jsonify({"error": "User not found"}), 404

    if not check_password_hash(user.get('password_hash', ''), old_password):
        return jsonify({"error": "Incorrect old password"}), 401

    new_password_hash = generate_password_hash(new_password)

    try:
        result = mongo.db.users.update_one(
            {"_id": user_oid},
            {"$set": {"password_hash": new_password_hash, "last_updated_at": datetime.now(timezone.utc)}}
        )
        if result.modified_count == 1:
            return jsonify({"message": "Password updated successfully"}), 200
        else:
             # This could happen if the new hash is identical to the old one,
             # but update_one might still report matched=1, modified=0.
             # Or if the user was deleted between find and update.
             print(f"Password update for user {user_oid}: matched={result.matched_count}, modified={result.modified_count}")
             # Check if user still exists
             if not mongo.db.users.find_one({"_id": user_oid}):
                   return jsonify({"error": "User not found during update"}), 404
             # If user exists but modified=0, maybe password was the same? Treat as success?
             return jsonify({"message": "Password update processed (no change detected or error)."}), 200 # Return OK maybe?

    except Exception as e:
        print(f"Error updating password for user {user_oid}: {e}")
        return jsonify({"error": "Failed to update password due to server error"}), 500


# --- Quiz Generation and Management Routes (Admin) ---

@app.route('/api/quiz/generate', methods=['POST'])
@jwt_required()
def generate_quiz():
    current_user_id_str = get_jwt_identity()
    try: user_oid = ObjectId(current_user_id_str)
    except Exception: return jsonify({"error": "Invalid user identity"}), 400

    user = mongo.db.users.find_one({"_id": user_oid})
    if not user or user.get("role") != "admin":
        return jsonify({"error": "Unauthorized – only admins can generate quizzes"}), 403

    data = request.get_json()
    print("➡️ Incoming quiz generation request:", data)

    quiz_type = data.get('quiz_type', 'General Quiz').strip()
    topic = data.get('topic', '').strip()
    difficulty = data.get('difficulty', 'Medium').strip()
    language = data.get('language', 'English').strip()

    if not topic: return jsonify({"error": "Topic is required"}), 400

    try:
        num_mcqs = int(data.get('num_mcqs', 10))
        if not (1 <= num_mcqs <= 20):
            return jsonify({"error": "Number of questions must be between 1 and 20."}), 422
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid number of questions. Must be an integer."}), 422

    prompt = ""
    retrieved_content = ""

    try:
        if quiz_type == "News-Based Quiz":
            print(f"Generating News-Based Quiz for topic: {topic}")
            news = scrape_google_news(topic, 3) # Use original num_articles=3
            if not news: return jsonify({"error": "No news articles found"}), 404

            final_urls = [article['link'] for article in news]
            content_list = scrape_final_url_content(final_urls)
            if not content_list: return jsonify({"error": "Could not extract content from news articles"}), 404

            # --- Save scraped content ---
            try:
                 with open("result.txt", "w", encoding="utf-8") as f: # Use original filename
                    f.write("\n\n".join(content_list))
            except Exception as e:
                 print(f"Warning: could not write result.txt: {e}")

            # --- Vector Store and RAG ---
            if not get_vector_store(content_list, user_oid):
                 print("Warning: Failed to update vector store. Proceeding without RAG context.")
                 # Fallback: use raw content if RAG fails
                 retrieved_content = "\n\n".join(content_list[:2]) # Use first few as basic context
            else:
                retrieved_content = retrieve_relevant_content(topic, user_oid)
                if not retrieved_content:
                    print("Warning: RAG retrieval failed. Using raw scraped content as context.")
                    retrieved_content = "\n\n".join(content_list[:2]) # Fallback

            if not retrieved_content:
                return jsonify({"error": "Failed to obtain context for news-based quiz generation."}), 500

            # --- USE ORIGINAL PROMPT ---
            prompt = f"""
            Using the following news content:\n\n {retrieved_content}\n\n
            Generate a {num_mcqs} multiple choice questions on the topic '{topic}' with '{difficulty}' difficulty in {language}.
            Format the response exactly like this:\n
            Question: ...\n
            a) Option 1\n
            b) Option 2\n
            c) Option 3\n
            d) Option 4\n
            Answer: option\n\n
            Ensure the questions are concise, only one correct answer, and no explanations are given.
            """
        else: # General Quiz
            print(f"Generating General Quiz for topic: {topic}")
            # --- USE ORIGINAL PROMPT ---
            prompt = f"""
            Generate a {num_mcqs} multiple choice questions on the topic '{topic}' with '{difficulty}' difficulty in {language}.
            Format the response exactly like this:\n
            Question: ...\n
            a) Option 1\n
            b) Option 2\n
            c) Option 3\n
            d) Option 4\n
            Answer: option\n\n
            Ensure the questions are concise, only one correct answer, and no explanations are given.
            """

        # --- Generate AI response ---
        ai_response = generate_ai_response(prompt)
        if not ai_response or not hasattr(ai_response, 'content'):
            # Optional: Save failed prompt
            try:
                 with open("failed_prompt.txt", "w", encoding="utf-8") as f: f.write(prompt)
            except: pass
            return jsonify({"error": "AI failed to generate quiz content."}), 500

        response_text = ai_response.content

        # --- Save raw AI response ---
        try:
            with open("result.txt", "w", encoding="utf-8") as f: # Use original filename 'result.txt'
                f.write(response_text)
        except Exception as e:
             print(f"Warning: could not write result.txt (AI response): {e}")

        # --- Format the response ---
        formatted_quiz = format_quiz_response(response_text, num_mcqs)

        if not formatted_quiz or len(formatted_quiz) < num_mcqs * 0.7:
            print(f"Error: Failed to parse sufficient questions. Parsed: {len(formatted_quiz)}, Expected: {num_mcqs}")
            return jsonify({
                "error": "Failed to format the generated quiz questions correctly.",
                "details": f"Expected {num_mcqs}, parsed {len(formatted_quiz)}. Check 'result.txt' on the server."
                }), 500

        # --- Save quiz to DB ---
        quiz_doc = {
            "type": quiz_type,
            "topic": topic,
            "difficulty": difficulty,
            "language": language,
            "num_mcqs_generated": num_mcqs,
            "questions": formatted_quiz,
            "created_by": user_oid,
            "status": "draft",
            "created_at": datetime.now(timezone.utc), # Store UTC
            # Optionally store prompt/response if needed for review/regen later
            "prompt": prompt.strip(),
            "raw_response": response_text.strip()
        }
        quiz_id = mongo.db.quizzes.insert_one(quiz_doc).inserted_id
        print(f"Quiz {quiz_id} created successfully in draft status.")

        # --- Record generation history ---
        # Use the original collection name 'quiz_history'
        mongo.db.quiz_history.insert_one({
            "user_id": user_oid,
            "quiz_id": quiz_id, # Link to the created quiz
            "quiz_type": quiz_type,
            "topic": topic,
            "difficulty": difficulty,
            "language": language,
            "timestamp": datetime.now(timezone.utc), # Store UTC
            "action": "generate" # Add action type
        })

        # --- Update recommendations ---
        update_topic_recommendations(current_user_id_str, topic)

        return jsonify({
            "message": "Quiz generated successfully and saved as draft.",
            "quiz_id": str(quiz_id),
            "questions": formatted_quiz # Return for immediate review
        }), 201 # 201 Created

    except Exception as e:
        print(f"❌ Unexpected error during quiz generation: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"An unexpected server error occurred: {str(e)}"}), 500


@app.route('/api/admin/quiz/history', methods=['GET'])
@jwt_required()
def admin_quiz_history():
    # ... (Keep the implementation from the previous corrected version) ...
    # This function handles fetching quizzes based on date range for admin.
    # It uses parse_datetime_string and relies on the MongoJSONEncoder for output formatting.
    current_user_id_str = get_jwt_identity()
    try: user_oid = ObjectId(current_user_id_str)
    except Exception: return jsonify({"error": "Invalid user identity"}), 400

    user = mongo.db.users.find_one({"_id": user_oid})
    if not user or user.get("role") != "admin":
        return jsonify({"error": "Unauthorized"}), 403

    from_date_str = request.args.get("from")
    to_date_str = request.args.get("to")

    now_utc = datetime.now(timezone.utc)
    # Default to last 30 days if no dates provided
    default_from_dt = now_utc - timedelta(days=30)
    default_to_dt = now_utc

    # Parse using the updated function, expects dayfirst=True for dd/mm/yyyy
    from_dt = parse_datetime_string(from_date_str, dayfirst=True) if from_date_str else default_from_dt
    to_dt = parse_datetime_string(to_date_str, dayfirst=True) if to_date_str else default_to_dt

    if not from_dt or not to_dt:
        return jsonify({"error": "Invalid date format provided. Use DD/MM/YYYY."}), 400

    # Adjust to_dt to include the whole day
    to_dt = to_dt.replace(hour=23, minute=59, second=59, microsecond=999999)

    print(f"Admin fetching quiz history from {from_dt.isoformat()} to {to_dt.isoformat()} UTC")

    try:
        query = {
            "created_at": {"$gte": from_dt, "$lte": to_dt}
        }
        # Add other filters if needed (e.g., status)
        status_filter = request.args.get("status")
        if status_filter:
             query["status"] = status_filter

        quizzes = list(mongo.db.quizzes.find(query).sort("created_at", -1))

        # The MongoJSONEncoder handles ObjectId and datetime formatting automatically
        return jsonify({"quizzes": quizzes}), 200

    except Exception as e:
        print(f"Error fetching admin quiz history: {e}")
        return jsonify({"error": "Failed to fetch quiz history"}), 500


@app.route('/api/admin/quiz/<quiz_id>', methods=['GET'])
@jwt_required()
def admin_get_quiz_details(quiz_id):
    # ... (Keep implementation from previous corrected version) ...
    current_user_id_str = get_jwt_identity()
    try: user_oid = ObjectId(current_user_id_str)
    except Exception: return jsonify({"error": "Invalid user identity"}), 400

    user = mongo.db.users.find_one({"_id": user_oid})
    if not user or user.get("role") != "admin":
        return jsonify({"error": "Unauthorized"}), 403

    if not ObjectId.is_valid(quiz_id):
        return jsonify({"error": "Invalid quiz ID format"}), 400
    quiz_oid = ObjectId(quiz_id)

    quiz = mongo.db.quizzes.find_one({"_id": quiz_oid})
    if not quiz:
        return jsonify({"error": "Quiz not found"}), 404

    # MongoJSONEncoder handles serialization
    return jsonify(quiz), 200

@app.route('/api/admin/quiz/<quiz_id>', methods=['DELETE'])
@jwt_required()
def delete_quiz(quiz_id):
    """
    Delete a quiz by ID (admin only)
    """
    current_user_id_str = get_jwt_identity()
    try:
        user_oid = ObjectId(current_user_id_str)
    except Exception:
        return jsonify({"error": "Invalid user identity"}), 400

    # Verify admin status
    user = mongo.db.users.find_one({"_id": user_oid})
    if not user or user.get("role") != "admin":
        return jsonify({"error": "Unauthorized access"}), 403
    
    # Validate quiz ID format
    try:
        quiz_oid = ObjectId(quiz_id)
    except Exception:
        return jsonify({"error": "Invalid quiz ID format"}), 400
    
    try:
        # Find the quiz first to ensure it exists
        quiz = mongo.db.quizzes.find_one({"_id": quiz_oid})
        if not quiz:
            return jsonify({"error": "Quiz not found"}), 404
        
        # Delete the quiz
        result = mongo.db.quizzes.delete_one({"_id": quiz_oid})
        
        if result.deleted_count == 1:
            # Optional: Log the deletion action
            log_entry = {
                "action": "quiz_delete",
                "quiz_id": quiz_oid,
                "admin_id": user_oid,
                "quiz_topic": quiz.get("topic", "Unknown"),
                "timestamp": datetime.now(timezone.utc)
            }
            mongo.db.admin_logs.insert_one(log_entry)
            
            return jsonify({"success": True, "message": "Quiz deleted successfully"}), 200
        else:
            return jsonify({"error": "Failed to delete quiz"}), 500
            
    except Exception as e:
        print(f"Error deleting quiz: {e}")
        return jsonify({"error": "An error occurred while deleting the quiz"}), 500
    

@app.route('/api/admin/quiz/review', methods=['POST'])
@jwt_required()
def review_quiz():
    # ... (Keep implementation from previous corrected version) ...
    # This function allows admin to save reviewed questions and update status.
    current_user_id_str = get_jwt_identity()
    try: user_oid = ObjectId(current_user_id_str)
    except Exception: return jsonify({"error": "Invalid user identity"}), 400

    user = mongo.db.users.find_one({"_id": user_oid})
    if not user or user.get("role") != "admin":
        return jsonify({"error": "Unauthorized"}), 403

    data = request.get_json()
    quiz_id_str = data.get("quiz_id")
    questions = data.get("questions") # List of approved questions
    new_status = data.get("status", "reviewed") # Default to reviewed, can be 'active' etc.

    if not quiz_id_str or not ObjectId.is_valid(quiz_id_str):
        return jsonify({"error": "Valid quiz_id is required"}), 400
    quiz_oid = ObjectId(quiz_id_str)

    if not isinstance(questions, list):
        return jsonify({"error": "Invalid format for 'questions'. Expected a list."}), 400

    # Basic validation of question structure
    if not all(isinstance(q, dict) and 'question' in q and 'options' in q and 'correct_answer' in q for q in questions):
         return jsonify({"error": "Each question must be an object with 'question', 'options', and 'correct_answer' keys."}), 400

    valid_statuses = ["draft", "reviewed", "active", "scheduled", "archived"]
    if new_status not in valid_statuses:
         return jsonify({"error": f"Invalid status. Must be one of: {', '.join(valid_statuses)}"}), 400

    try:
        update_data = {
            "questions": questions,
            "status": new_status,
            "last_updated_at": datetime.now(timezone.utc)
        }
        # If moving away from scheduled, clear the schedule time
        if new_status != "scheduled":
             update_data["scheduled_datetime"] = None

        result = mongo.db.quizzes.update_one(
            {"_id": quiz_oid},
            {"$set": update_data}
        )

        if result.matched_count == 0: return jsonify({"error": "Quiz not found"}), 404
        if result.modified_count == 0: return jsonify({"message": "Quiz content and status were already up-to-date."}), 200

        return jsonify({"message": f"Quiz reviewed and status set to '{new_status}' successfully"}), 200

    except Exception as e:
        print(f"Error reviewing quiz {quiz_id_str}: {e}")
        return jsonify({"error": f"An unexpected error occurred: {str(e)}"}), 500


@app.route('/api/admin/quiz/regenerate', methods=['POST'])
@jwt_required()
def regenerate_questions():
    # This endpoint generates NEW questions based on the quiz context
    # and RETURNS them. It DOES NOT save them automatically.
    # Frontend should handle adding these to the review UI.
    current_user_id_str = get_jwt_identity()
    try: user_oid = ObjectId(current_user_id_str)
    except Exception: return jsonify({"error": "Invalid user identity"}), 400

    user = mongo.db.users.find_one({"_id": user_oid})
    if not user or user.get("role") != "admin":
        return jsonify({"error": "Unauthorized"}), 403

    data = request.get_json()
    quiz_id_str = data.get("quiz_id")
    count_str = data.get("count")

    if not quiz_id_str or not ObjectId.is_valid(quiz_id_str):
        return jsonify({"error": "Valid quiz_id is required"}), 400
    quiz_oid = ObjectId(quiz_id_str)

    try:
        count = int(count_str)
        if not (1 <= count <= 10):
            return jsonify({"error": "Regeneration count must be between 1 and 10."}), 422
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid count for regeneration."}), 422

    quiz = mongo.db.quizzes.find_one({"_id": quiz_oid})
    if not quiz: return jsonify({"error": "Quiz not found"}), 404

    topic = quiz.get('topic', 'Unknown Topic')
    difficulty = quiz.get('difficulty', 'Medium')
    language = quiz.get('language', 'English')
    quiz_type = quiz.get('type', 'General Quiz')

    print(f"Regenerating {count} questions for quiz {quiz_id_str} (Topic: {topic})")

    prompt = ""
    retrieved_content = "" # For news-based
    try:
        if quiz_type == 'News-Based Quiz':
            # Try to retrieve context again (RAG)
            retrieved_content = retrieve_relevant_content(topic, user_oid)
            if not retrieved_content:
                # Fallback: use original prompt/response if stored?
                if quiz.get("raw_response"):
                     print("Warning: RAG failed for regen. Using stored response as potential context.")
                     retrieved_content = quiz["raw_response"] #[:3000] # Limit length
                else:
                     print("Warning: No RAG/stored context for regen. Using general prompt.")
                     # Fall through to general prompt case

            # --- USE ORIGINAL PROMPT (Regen News) ---
            if retrieved_content: # Only use news prompt if we have context
                prompt = f"""
                Using the following news content:\n\n {retrieved_content}\n\n
                Generate {count} multiple choice questions on the topic '{topic}' with '{difficulty}' difficulty in {language}.
                Format the response exactly like this:\n
                Question: ...\n
                a) Option 1\n
                b) Option 2\n
                c) Option 3\n
                d) Option 4\n
                Answer: option\n\n
                """ # Note: Original didn't specify NEW questions, keeping it that way.
            else: # RAG/Fallback failed, use general prompt instead
                 quiz_type = 'General Quiz' # Treat as general


        # If General or News-Based fallback
        if quiz_type != 'News-Based Quiz' or not prompt :
            # --- USE ORIGINAL PROMPT (Regen General) ---
            prompt = f"""
            Generate {count} multiple choice questions on the topic '{topic}' with '{difficulty}' difficulty in {language}.
            Format the response exactly like this:\n
            Question: ...\n
            a) Option 1\n
            b) Option 2\n
            c) Option 3\n
            d) Option 4\n
            Answer: option\n\n
            """

        ai_response = generate_ai_response(prompt)
        if not ai_response or not hasattr(ai_response, 'content'):
            return jsonify({"error": "AI failed to generate regenerated questions."}), 500

        response_text = ai_response.content
        new_questions = format_quiz_response(response_text, count)

        if not new_questions:
             return jsonify({"error": "Failed to parse regenerated questions from AI response."}), 500

        # Return the newly generated questions for the admin to handle
        return jsonify({
            "message": f"{len(new_questions)} questions regenerated. Add desired ones to the quiz via the Review/Save function.",
            "regenerated_questions": new_questions
        }), 200

    except Exception as e:
        print(f"Error regenerating questions for quiz {quiz_id_str}: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"Error regenerating questions: {str(e)}"}), 500

# --- Schedule Quiz (Admin) ---  
@app.route('/api/admin/quiz/schedule', methods=['POST'])
@jwt_required()
def schedule_quiz():
    current_user_id_str = get_jwt_identity()
    try: user_oid = ObjectId(current_user_id_str)
    except Exception: return jsonify({"error": "Invalid user identity"}), 400

    user = mongo.db.users.find_one({"_id": user_oid})
    if not user or user.get("role") != "admin":
        return jsonify({"error": "Unauthorized"}), 403

    data = request.get_json()
    quiz_id_str = data.get("quiz_id")
    datetime_str = data.get("scheduled_datetime")
    duration_str = data.get("duration_minutes") # <<< New: Get duration

    if not quiz_id_str or not ObjectId.is_valid(quiz_id_str): return jsonify({"error": "Valid quiz_id required"}), 400
    quiz_oid = ObjectId(quiz_id_str)
    if not datetime_str: return jsonify({"error": "scheduled_datetime required"}), 400

    # --- New: Validate Duration ---
    duration_minutes = None
    if duration_str is not None:
        try:
            duration_minutes = int(duration_str)
            if duration_minutes <= 0:
                return jsonify({"error": "Duration must be a positive number of minutes."}), 400
        except (ValueError, TypeError):
            return jsonify({"error": "Invalid duration format. Must be an integer."}), 400
    else:
        # If duration is not provided, maybe set a default or error? Let's default for now.
        duration_minutes = 30 # Default to 30 minutes if not provided
        print(f"Warning: Duration not provided for quiz {quiz_id_str}, defaulting to {duration_minutes} minutes.")
    # --- End New Duration Validation ---

    scheduled_dt_utc = parse_datetime_string(datetime_str)
    if not scheduled_dt_utc: return jsonify({"error": "Invalid scheduled_datetime format"}), 400
    if scheduled_dt_utc <= datetime.now(timezone.utc): return jsonify({"error": "Schedule time must be in future"}), 400

    try:
        quiz = mongo.db.quizzes.find_one({"_id": quiz_oid}, {"_id": 1, "questions": 1}) # Check questions exist
        if not quiz: return jsonify({"error": "Quiz not found"}), 404
        if not quiz.get("questions"): return jsonify({"error": "Cannot schedule quiz with no questions"}), 400

        # --- New: Include duration_minutes in update ---
        update_result = mongo.db.quizzes.update_one(
            {"_id": quiz_oid},
            {
                "$set": {
                    "scheduled_datetime": scheduled_dt_utc,
                    "duration_minutes": duration_minutes, # Store duration
                    "status": "scheduled", # Mark as scheduled
                    "last_updated_at": datetime.now(timezone.utc)
                }
            }
        )
        # --- End New Update ---

        if update_result.matched_count == 0: return jsonify({"error": "Quiz not found during update."}), 404

        print(f"Quiz {quiz_id_str} scheduled for {scheduled_dt_utc.isoformat()} UTC with duration {duration_minutes} mins")
        scheduled_ist_str = format_datetime(scheduled_dt_utc)

        # --- New: Return saved data for optimistic update ---
        # Calculate end time to return it
        end_dt_utc = scheduled_dt_utc + timedelta(minutes=duration_minutes)
        return jsonify({
            "message": f"Quiz scheduled for {scheduled_ist_str} ({duration_minutes} min duration)",
            "scheduled_datetime_utc": scheduled_dt_utc.isoformat(), # Return UTC ISO strings
            "end_datetime_utc": end_dt_utc.isoformat(),
            "duration_minutes": duration_minutes
            }), 200
        # --- End New Return ---

    except Exception as e:
        print(f"Error scheduling quiz {quiz_id_str}: {e}")
        return jsonify({"error": f"Failed to schedule: {str(e)}"}), 500

@app.route('/api/quiz/upcoming', methods=['GET'])
@jwt_required()
def get_upcoming_quizzes():
    current_user_id_str = get_jwt_identity()
    try:
        user_oid = ObjectId(current_user_id_str)
    except Exception:
        return jsonify({"error": "Invalid user identity"}), 400

    now_utc = datetime.now(timezone.utc)

    try:
        # --- MODIFIED QUERY ---
        # Fetch quizzes that are scheduled AND either:
        # 1. Their start time is in the future
        # 2. Their start time is in the past BUT their calculated end time is still in the future
        #    (We'll filter more accurately after fetching, as calculating end time in query is complex)
        # Fetch potentially relevant scheduled quizzes first
        potential_quizzes = list(mongo.db.quizzes.find(
            {
                "status": "scheduled",
                # Optimization: Fetch quizzes starting soon or recently started
                # This fetches quizzes starting up to 1 day ago, adjust as needed
                "scheduled_datetime": {"$gt": now_utc - timedelta(days=1)}
            },
            {"prompt": 0, "raw_response": 0, "questions.correct_answer": 0} # Exclude fields
        ).sort("scheduled_datetime", 1)) # Sort soonest first

        # --- Post-processing in Python ---
        processed_quizzes = []
        if not potential_quizzes:
             return jsonify({"quizzes": []}), 200 # Return empty list early

        # Get all registration IDs for the current user in one go
        user_registrations = mongo.db.quiz_registrations.find(
            {"user_id": user_oid},
            {"quiz_id": 1, "_id": 0}
        )
        registered_quiz_ids = {str(reg["quiz_id"]) for reg in user_registrations}

        for quiz in potential_quizzes:
            scheduled_time_utc = quiz.get("scheduled_datetime")
            duration_minutes = quiz.get("duration_minutes")
            quiz_id_str = str(quiz["_id"]) # Get string ID for comparison

            # Ensure scheduled_time_utc is aware UTC
            if scheduled_time_utc and scheduled_time_utc.tzinfo is None:
                scheduled_time_utc = scheduled_time_utc.replace(tzinfo=timezone.utc)

            # Calculate end time (if possible)
            end_datetime_utc = None
            if scheduled_time_utc and duration_minutes:
                end_datetime_utc = scheduled_time_utc + timedelta(minutes=duration_minutes)

            # Determine if live *now* based on server time
            is_live = False
            if scheduled_time_utc and now_utc >= scheduled_time_utc:
                if end_datetime_utc is None or now_utc < end_datetime_utc: # Live if started and (no end time OR not yet ended)
                    is_live = True

            # Determine if quiz has actually ended (if end time exists)
            has_ended = end_datetime_utc and now_utc >= end_datetime_utc

            # Only include quizzes that haven't ended yet
            if not has_ended:
                 # Check if user is registered for this quiz
                 is_registered = quiz_id_str in registered_quiz_ids

                 # Add processed flags to the quiz object
                 quiz["is_live"] = is_live
                 quiz["is_registered"] = is_registered
                 # Optional: calculate can_attempt flag on backend too
                 # quiz["can_attempt"] = is_registered and is_live

                 processed_quizzes.append(quiz)

        # MongoJSONEncoder handles date formatting for the final list
        return jsonify({"quizzes": processed_quizzes}), 200

    except Exception as e:
        print(f"Error fetching upcoming quizzes: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": "Failed to fetch upcoming quizzes"}), 500


@app.route('/api/quiz/register/<quiz_id>', methods=['POST'])
@jwt_required()
def register_for_quiz(quiz_id):
    # ... (Keep implementation from previous corrected version) ...
    # Checks if quiz exists, is scheduled, and handles registration/duplicates.
    current_user_id_str = get_jwt_identity()
    try: user_oid = ObjectId(current_user_id_str)
    except Exception: return jsonify({"error": "Invalid user identity"}), 400

    if not ObjectId.is_valid(quiz_id):
        return jsonify({"error": "Invalid quiz ID format"}), 400
    quiz_oid = ObjectId(quiz_id)

    try:
        # Check if the quiz exists and is scheduled
        quiz = mongo.db.quizzes.find_one({
            "_id": quiz_oid,
            "status": "scheduled"
            # Consider adding scheduled_datetime > now check if registration should close after start?
        }, {"_id": 1})

        if not quiz: return jsonify({"error": "Quiz not found or is not available for registration."}), 404

        # Check if already registered
        existing_registration = mongo.db.quiz_registrations.find_one({
            "user_id": user_oid, "quiz_id": quiz_oid
        })
        if existing_registration: return jsonify({"message": "You are already registered for this quiz"}), 200

        # Register
        mongo.db.quiz_registrations.insert_one({
            "user_id": user_oid,
            "quiz_id": quiz_oid,
            "registered_at": datetime.now(timezone.utc) # Store UTC
        })
        print(f"User {user_oid} registered for quiz {quiz_oid}")
        return jsonify({"message": "Successfully registered for the quiz"}), 201

    except Exception as e:
        print(f"Error registering user {user_oid} for quiz {quiz_oid}: {e}")
        return jsonify({"error": "Failed to register for quiz"}), 500


@app.route('/api/quiz/register/<quiz_id>/check', methods=['GET'])
@jwt_required()
def check_registration(quiz_id):
    # ... (Keep implementation from previous corrected version) ...
    current_user_id_str = get_jwt_identity()
    try: user_oid = ObjectId(current_user_id_str)
    except Exception: return jsonify({"error": "Invalid user identity"}), 400

    if not ObjectId.is_valid(quiz_id):
        return jsonify({"error": "Invalid quiz ID format"}), 400
    quiz_oid = ObjectId(quiz_id)

    try:
        existing = mongo.db.quiz_registrations.find_one({
            "quiz_id": quiz_oid, "user_id": user_oid
        })
        return jsonify({"registered": bool(existing)})
    except Exception as e:
        print(f"Error checking registration for user {user_oid}, quiz {quiz_oid}: {e}")
        return jsonify({"error": "Failed to check registration status"}), 500

@app.route('/api/quiz/registered', methods=['GET'])
@jwt_required()
def get_user_registered_quizzes_ids():
    # ... (Keep implementation from previous corrected version) ...
    current_user_id_str = get_jwt_identity()
    try: user_oid = ObjectId(current_user_id_str)
    except Exception: return jsonify({"error": "Invalid user identity"}), 400

    try:
        registrations = mongo.db.quiz_registrations.find(
            {"user_id": user_oid}, {"quiz_id": 1, "_id": 0}
        )
        registered_ids = [str(reg["quiz_id"]) for reg in registrations]
        return jsonify({"registered_quiz_ids": registered_ids})
    except Exception as e:
        print(f"Error fetching registered quiz IDs for user {user_oid}: {e}")
        return jsonify({"error": "Failed to fetch registered quizzes"}), 500

@app.route('/api/quiz/<quiz_id>', methods=['GET'])
@jwt_required()
def get_quiz_for_attempt(quiz_id):
    current_user_id_str = get_jwt_identity()
    try: user_oid = ObjectId(current_user_id_str)
    except Exception: return jsonify({"error": "Invalid user identity"}), 400

    if not ObjectId.is_valid(quiz_id): return jsonify({"error": "Invalid quiz ID format"}), 400
    quiz_oid = ObjectId(quiz_id)

    try:
        quiz = mongo.db.quizzes.find_one({"_id": quiz_oid}) # Fetch full quiz document
        if not quiz: return jsonify({"error": "Quiz not found"}), 404

        quiz_status = quiz.get("status", "draft")
        now_utc = datetime.now(timezone.utc)
        scheduled_time_utc = quiz.get("scheduled_datetime")
        duration_minutes = quiz.get("duration_minutes") # Get duration

        # Calculate end_datetime if possible
        end_datetime_utc = None
        if scheduled_time_utc and duration_minutes:
             # Ensure scheduled_time_utc is timezone-aware (should be from DB)
             if scheduled_time_utc.tzinfo is None:
                 scheduled_time_utc = scheduled_time_utc.replace(tzinfo=timezone.utc)
             end_datetime_utc = scheduled_time_utc + timedelta(minutes=duration_minutes)


        # --- Access Checks (incorporate end time if available) ---
        is_live = False
        if quiz_status in ["active", "reviewed"]:
            is_live = True # Always live if active/reviewed (no schedule)
        elif quiz_status == "scheduled":
            if not scheduled_time_utc:
                 print(f"Error: Scheduled quiz {quiz_id} missing schedule time!")
                 return jsonify({"error": "Quiz schedule configuration error."}), 500
            # Ensure comparison is timezone-aware
            if scheduled_time_utc.tzinfo is None: scheduled_time_utc = scheduled_time_utc.replace(tzinfo=timezone.utc)

            # Check if current time is within the scheduled window
            if now_utc >= scheduled_time_utc and (end_datetime_utc is None or now_utc < end_datetime_utc):
                 is_live = True
            elif now_utc < scheduled_time_utc:
                 start_time_str = format_datetime(scheduled_time_utc) # Format to IST
                 return jsonify({"error": f"Quiz starts at {start_time_str}."}), 403
            elif end_datetime_utc and now_utc >= end_datetime_utc:
                 return jsonify({"error": "This quiz has already ended."}), 403

        # Check status/registration/submission (only if potentially live)
        if not is_live and quiz_status != "active" and quiz_status != "reviewed": # Check if not live based on schedule
             return jsonify({"error": "Quiz is not currently available for attempts."}), 403

        if quiz_status == "scheduled": # Re-check registration/submission only for scheduled
            reg = mongo.db.quiz_registrations.find_one({"user_id": user_oid, "quiz_id": quiz_oid})
            if not reg: return jsonify({"error": "You are not registered for this quiz."}), 403
            sub = mongo.db.quiz_submissions.find_one({"user_id": user_oid, "quiz_id": quiz_oid})
            if sub: return jsonify({"error": "You have already completed this quiz."}), 403
        elif quiz_status == "draft" or quiz_status == "archived": # Double check invalid statuses
             return jsonify({"error": "Quiz is not available for attempts."}), 403


        # --- Prepare Quiz Data (Remove Answers) ---
        questions_for_user = []
        for q in quiz.get("questions", []):
            questions_for_user.append({k: v for k, v in q.items() if k != 'correct_answer'})
        if not questions_for_user: return jsonify({"error": "Quiz has no questions."}), 404

        # --- MODIFIED RESPONSE: Include calculated end_datetime_utc ---
        quiz_data_for_user = {k: v for k, v in quiz.items() if k not in ['password_hash', 'prompt', 'raw_response']}
        quiz_data_for_user["questions"] = questions_for_user
        quiz_data_for_user["_id"] = str(quiz_data_for_user["_id"])
        quiz_data_for_user["id"] = quiz_data_for_user["_id"]
        quiz_data_for_user["num_mcqs"] = len(questions_for_user)
        # Add calculated end time (as UTC ISO string, let encoder format)
        quiz_data_for_user["end_datetime"] = end_datetime_utc # Add this field

        return jsonify(quiz_data_for_user), 200
        # --- END MODIFICATION ---

    except Exception as e:
        print(f"Error fetching quiz {quiz_id} for attempt: {str(e)}")
        import traceback; traceback.print_exc()
        return jsonify({"error": f"Error preparing quiz: {str(e)}"}), 500


@app.route('/api/quiz/submit/<quiz_id>', methods=['POST'])
@jwt_required()
def submit_quiz(quiz_id):
    """
    Handles user submitting answers for a quiz.
    Validates access (including a grace period for scheduled quizzes),
    calculates score, and stores submission details including quiz topic and type.
    """
    current_user_id_str = get_jwt_identity()
    try:
        user_oid = ObjectId(current_user_id_str)
    except Exception:
        return jsonify({"error": "Invalid user identity"}), 400

    if not ObjectId.is_valid(quiz_id):
        return jsonify({"error": "Invalid quiz ID format"}), 400
    quiz_oid = ObjectId(quiz_id)

    data = request.get_json()
    if not data:
        return jsonify({"error": "Missing submission data"}), 400

    submitted_answers = data.get("answers")
    time_taken = data.get("time_taken") # Original key name

    # Validate answers format
    if not isinstance(submitted_answers, list):
         return jsonify({"error": "Invalid format for 'answers'. Expected a list."}), 400

    # Parse time_taken safely
    time_taken_seconds = None
    if time_taken is not None:
        try:
            time_taken_seconds = float(time_taken)
            if time_taken_seconds < 0: time_taken_seconds = None # Discard negative times
        except (ValueError, TypeError):
            print(f"Warning: Invalid time_taken format received: {time_taken}")
            # Optionally log this warning more formally

    now_utc = datetime.now(timezone.utc)

    try:
        # Fetch quiz details including topic and type
        quiz = mongo.db.quizzes.find_one(
            {"_id": quiz_oid},
            # Projection: Include fields needed for validation and storing context
            {"questions": 1, "status": 1, "scheduled_datetime": 1, "topic": 1, "type": 1, "duration_minutes": 1}
        )

        if not quiz:
            return jsonify({"error": "Quiz not found"}), 404

        # Extract quiz details safely
        questions = quiz.get("questions", [])
        num_questions = len(questions)
        quiz_status = quiz.get("status")
        quiz_topic = quiz.get("topic", "Unknown Topic")
        quiz_type = quiz.get("type", "General")
        scheduled_time_utc = quiz.get("scheduled_datetime")
        duration_minutes = quiz.get("duration_minutes")

        # --- Validation Checks ---
        if not questions:
            return jsonify({"error": "Cannot submit to a quiz with no questions."}), 400

        if len(submitted_answers) != num_questions:
            return jsonify({"error": f"Incorrect number of answers submitted. Expected {num_questions}, got {len(submitted_answers)}."}), 400

        # Check quiz status and schedule validity
        is_active = False
        error_message = "This quiz is not currently active for submissions." # Default error

        if quiz_status in ["active", "reviewed"]:
            is_active = True # Active/reviewed quizzes are always considered active
        elif quiz_status == "scheduled":
            if not scheduled_time_utc:
                print(f"Error: Scheduled quiz {quiz_id} missing schedule time!")
                return jsonify({"error": "Quiz schedule configuration error."}), 500

             # Ensure scheduled_time is timezone-aware UTC
            if scheduled_time_utc.tzinfo is None:
                # Attempt to make it timezone-aware assuming UTC if naive
                scheduled_time_utc = scheduled_time_utc.replace(tzinfo=timezone.utc)

            # Calculate end time if possible
            end_datetime_utc = None
            if duration_minutes:
                end_datetime_utc = scheduled_time_utc + timedelta(minutes=duration_minutes)

            # *** START GRACE PERIOD LOGIC ***
            grace_period = timedelta(seconds=15) # Allow 15 seconds grace period
            # *** END GRACE PERIOD LOGIC ***

            if now_utc < scheduled_time_utc:
                 # Quiz hasn't started yet
                 start_time_str = format_datetime(scheduled_time_utc) # Assumes format_datetime is defined elsewhere
                 error_message = f"Scheduled quiz has not started yet. Starts at {start_time_str}."
            # *** MODIFIED CHECK: Check against end_time + grace_period ***
            elif end_datetime_utc and now_utc >= (end_datetime_utc + grace_period):
                 # Quiz ended, even considering the grace period
                 error_message = "The submission window for this quiz has closed."
            else:
                 # Quiz is either ongoing OR within the grace period
                 is_active = True

                 # Check registration only for scheduled quizzes that are active/in grace
                 reg = mongo.db.quiz_registrations.find_one({"user_id": user_oid, "quiz_id": quiz_oid})
                 if not reg:
                     is_active = False # Mark as inactive if not registered
                     error_message = "You are not registered for this scheduled quiz."

        elif quiz_status in ["draft", "archived"]:
            error_message = "This quiz is not available for submissions."
        else:
            # Handle any other unexpected statuses
            error_message = f"Quiz status '{quiz_status}' prevents submissions."

        # --- Main Access Check ---
        if not is_active:
            # If any check above set is_active to False or it remained False
            return jsonify({"error": error_message}), 403

        # Check if already submitted (Only check this *after* confirming the quiz is active/accessible)
        already_submitted = mongo.db.quiz_submissions.find_one({"user_id": user_oid, "quiz_id": quiz_oid})
        if already_submitted:
            # Use a specific error message for duplicate submissions
            return jsonify({"error": "You have already submitted answers for this quiz."}), 403 # Changed from 403 to maybe 409 Conflict? 403 is fine too.

        # --- Calculate Score ---
        correct_answers_list = [q.get('correct_answer', '').strip().lower() for q in questions] # Ensure correct answer is clean
        score = 0
        results_detailed = []
        for i, submitted_raw in enumerate(submitted_answers):
            # Clean submitted answer (handle None, ensure string, lowercase)
            submitted = str(submitted_raw).strip().lower() if submitted_raw is not None else ""
            is_correct = (submitted == correct_answers_list[i])
            if is_correct: score += 1
            results_detailed.append({
                "question_index": i,
                "submitted": submitted_raw, # Store the original answer format
                "correct": correct_answers_list[i],
                "is_correct": is_correct
            })

        # --- Save Submission (Include quiz_topic and quiz_type) ---
        submission_doc = {
            "quiz_id": quiz_oid,
            "user_id": user_oid,
            "quiz_topic": quiz_topic,          # Stored Topic
            "quiz_type": quiz_type,            # Stored Type
            "submitted_answers": submitted_answers, # Raw answers submitted
            "correct_answers": correct_answers_list, # Correct answers at time of submission
            "results_detailed": results_detailed,   # Detailed breakdown
            "score": score,
            "total": num_questions,            # Total questions in the quiz
            "completion_time_seconds": time_taken_seconds, # Parsed time
            "submitted_at": now_utc            # UTC timestamp
        }
        sub_result = mongo.db.quiz_submissions.insert_one(submission_doc)
        submission_id = sub_result.inserted_id

        print(f"Submission {submission_id} recorded for quiz {quiz_id} by user {user_oid}. Score: {score}/{num_questions}")

        # Return success response
        return jsonify({
            "message": "Quiz submitted successfully!",
            "submission_id": str(submission_id),
            "score": score,
            "total": num_questions
        }), 201 # 201 Created

    except Exception as e:
        # Log the full error traceback for debugging
        print(f"❌ Unexpected error submitting quiz {quiz_id} for user {user_oid}: {str(e)}")
        traceback.print_exc() # Make sure traceback is imported
        return jsonify({"error": f"An unexpected server error occurred during submission: {str(e)}"}), 500


@app.route('/api/quiz/results/<quiz_id>', methods=['GET']) 
@jwt_required()
def get_quiz_results(quiz_id):

    # --- Start of original GET logic ---
    current_user_id_str = get_jwt_identity()
    try:
        user_oid = ObjectId(current_user_id_str)
    except Exception:
        # Use jsonify for proper JSON response
        return jsonify({"error": "Invalid user identity"}), 400

    if not ObjectId.is_valid(quiz_id):
        return jsonify({"error": "Invalid quiz ID format"}), 400
    quiz_oid = ObjectId(quiz_id)

    try:
        # ... (rest of the logic to fetch submission, rank, quiz info) ...
        submission = mongo.db.quiz_submissions.find_one({
            "user_id": user_oid, "quiz_id": quiz_oid
        })
        if not submission:
             quiz_exists = mongo.db.quizzes.find_one({"_id": quiz_oid}, {"_id": 1})
             return jsonify({"error": "Quiz not found." if not quiz_exists else "Submission not found."}), 404

        all_submissions = list(mongo.db.quiz_submissions.find(
            {"quiz_id": quiz_oid},
            {"user_id": 1, "score": 1, "completion_time_seconds": 1, "submitted_at": 1}
        ))

        all_submissions.sort(key=lambda x: (
            -x.get('score', 0),
             x.get('completion_time_seconds', float('inf')),
             x.get('submitted_at', datetime.max.replace(tzinfo=timezone.utc))
        ))

        rank = next((i + 1 for i, s in enumerate(all_submissions) if s['user_id'] == user_oid), -1)

        quiz = mongo.db.quizzes.find_one(
            {"_id": quiz_oid},
            {"topic": 1, "type": 1, "questions": 1}
        )
        questions_with_answers = quiz.get("questions", []) if quiz else []

        response_data = {
            "submission": submission,
            "rank": rank,
            "total_participants": len(all_submissions),
            "quiz_info": {
                "topic": quiz.get("topic", "N/A") if quiz else "N/A",
                "type": quiz.get("type", "N/A") if quiz else "N/A",
            } if quiz else None,
            "quiz_questions": questions_with_answers
        }

        # Use jsonify - it handles content type and uses the custom encoder
        return jsonify(response_data), 200

    except Exception as e:
        print(f"Error fetching results for quiz {quiz_id}, user {user_oid}: {str(e)}")
        import traceback
        traceback.print_exc()
        # Use jsonify for error response
        return jsonify({"error": f"An error occurred fetching results: {str(e)}"}), 500

    # REMOVE the manual response creation and setting .data
    # response.data = json.dumps(response_data, cls=MongoJSONEncoder)
    # return response, 200

@app.route('/api/quiz/leaderboard/<quiz_id>', methods=['GET'])
@jwt_required() # Decide if leaderboard needs login
def get_quiz_leaderboard(quiz_id):
    # ... (Keep implementation from previous corrected version) ...
    # Fetches top submissions, sorts, gets user names.
    if not ObjectId.is_valid(quiz_id):
        return jsonify({"error": "Invalid quiz ID format"}), 400
    quiz_oid = ObjectId(quiz_id)

    try:
         quiz_exists = mongo.db.quizzes.find_one({"_id": quiz_oid}, {"_id": 1})
         if not quiz_exists: return jsonify({"error": "Quiz not found."}), 404

         submissions = list(mongo.db.quiz_submissions.find(
            {"quiz_id": quiz_oid},
            {"user_id": 1, "score": 1, "total": 1, "completion_time_seconds": 1, "submitted_at": 1, "_id": 0}
         ))

         if not submissions: return jsonify({"leaderboard": []}), 200

         submissions.sort(key=lambda x: (
             -x.get('score', 0),
              x.get('completion_time_seconds', float('inf')),
              x.get('submitted_at', datetime.max.replace(tzinfo=timezone.utc))
         ))

         top_n = 20 # Leaderboard size
         top_submissions = submissions[:top_n]

         user_ids = [s['user_id'] for s in top_submissions]
         users_info = mongo.db.users.find({"_id": {"$in": user_ids}}, {"_id": 1, "name": 1})
         user_map = {str(user["_id"]): user.get("name", "Anonymous") for user in users_info}

         leaderboard = []
         for rank, sub in enumerate(top_submissions, 1):
             user_id_str = str(sub['user_id'])
             # Let encoder format date
             leaderboard.append({
                 "rank": rank,
                 "user_name": user_map.get(user_id_str, "Unknown User"),
                 "score": sub.get('score'),
                 "total": sub.get('total'),
                 "completion_time": sub.get('completion_time_seconds'), # Use original key name
                 "submitted_at": sub.get('submitted_at') # Use original key name
             })

         return jsonify({"leaderboard": leaderboard}), 200

    except Exception as e:
        print(f"Error fetching leaderboard for quiz {quiz_id}: {str(e)}")
        return jsonify({"error": "Failed to fetch leaderboard"}), 500


@app.route('/api/user/submissions', methods=['GET'])
@jwt_required()
def get_user_submissions():
    """
    Fetches the current user's quiz submission history.
    Retrieves quiz topic and type directly from the submission record.
    """
    current_user_id_str = get_jwt_identity()
    try:
        user_oid = ObjectId(current_user_id_str)
    except Exception:
        return jsonify({"error": "Invalid user identity"}), 400

    try:
        # Fetch submissions including the stored topic and type
        # Ensure the projection includes the necessary fields
        submissions = list(mongo.db.quiz_submissions.find(
            {"user_id": user_oid},
            # Projection: include fields needed for display
            {
                "quiz_id": 1,
                "quiz_topic": 1,         # <<< Ensure this is fetched
                "quiz_type": 1,          # <<< Ensure this is fetched
                "score": 1,
                "total": 1,
                "completion_time_seconds": 1,
                "submitted_at": 1,
                "_id": 1                 # Include submission ID
            }
        ).sort("submitted_at", -1)) # Sort newest first

        if not submissions:
            return jsonify({"submissions": []}), 200

        # Prepare results using data directly from the submission documents
        results = []
        for sub in submissions:
            quiz_id_str = str(sub["quiz_id"])
            # --- UPDATED: Get topic/type directly from submission ---
            # Use .get() with defaults in case older submissions don't have these fields yet
            topic = sub.get("quiz_topic", "Unknown Topic")
            quiz_type = sub.get("quiz_type", "General")
            # --- END UPDATED ---

            results.append({
                "submission_id": str(sub["_id"]),
                "quiz_id": quiz_id_str,
                "quiz_topic": topic,      # Use the topic from the submission
                "quiz_type": quiz_type,     # Use the type from the submission
                "score": sub.get("score"),
                "total": sub.get("total"),
                "completion_time_seconds": sub.get("completion_time_seconds"),
                "submitted_at": sub.get("submitted_at") # Let MongoJSONEncoder handle datetime
            })

        # Use jsonify which correctly uses the custom encoder
        return jsonify({"submissions": results}), 200

    except Exception as e:
        print(f"Error fetching user submissions for {user_oid}: {str(e)}")
        import traceback
        traceback.print_exc() # Log full error for debugging
        return jsonify({"error": "Failed to fetch submission history"}), 500

# --- User Management Routes (Admin) ---
# Keep GET, POST, PUT, DELETE /api/admin/users from previous corrected version
# They handle listing, creating, updating, deleting users by admin.

@app.route('/api/admin/users', methods=['GET'])
@jwt_required()
def admin_get_all_users():
    # ... (Keep implementation from previous corrected version) ...
    current_user_id_str = get_jwt_identity()
    try: admin_oid = ObjectId(current_user_id_str)
    except Exception: return jsonify({"error": "Invalid admin identity"}), 400

    admin_user = mongo.db.users.find_one({"_id": admin_oid})
    if not admin_user or admin_user.get('role') != 'admin':
        return jsonify({"error": "Unauthorized"}), 403

    try:
        page = int(request.args.get("page", 1))
        limit = int(request.args.get("limit", 10))
        search = request.args.get("search", "").strip()

        if page < 1: page = 1
        if limit < 1: limit = 10
        if limit > 100: limit = 100

        query = {}
        if search:
            search_regex = {"$regex": search, "$options": "i"}
            query["$or"] = [{"name": search_regex}, {"email": search_regex}]

        total_users = mongo.db.users.count_documents(query)
        total_pages = (total_users + limit - 1) // limit

        cursor = mongo.db.users.find(query, {"password_hash": 0})\
                               .sort("created_at", -1)\
                               .skip((page - 1) * limit)\
                               .limit(limit)
        users_list = list(cursor)

        # Get submission counts
        user_ids = [user["_id"] for user in users_list]
        submission_counts = mongo.db.quiz_submissions.aggregate([
            {"$match": {"user_id": {"$in": user_ids}}},
            {"$group": {"_id": "$user_id", "count": {"$sum": 1}}}
        ])
        submission_map = {str(item["_id"]): item["count"] for item in submission_counts}

        # Prepare final data (encoder handles dates/OIDs)
        users_data = []
        for user in users_list:
            user_id_str = str(user["_id"])
            user_data = { **user } # Copy user dict
            user_data["id"] = user_id_str # Add 'id' alias
            user_data["_id"] = user_id_str # Ensure _id is string
            user_data["quiz_count"] = submission_map.get(user_id_str, 0)
            users_data.append(user_data)

        return jsonify({
            "users": users_data,
            "total_users": total_users,
            "total_pages": total_pages,
            "current_page": page
        }), 200
    except Exception as e:
        print(f"Error in admin_get_all_users: {e}")
        return jsonify({"error": "Failed to fetch users"}), 500

@app.route('/api/admin/users', methods=['POST'])
@jwt_required()
def admin_create_user():
    # ... (Keep implementation from previous corrected version) ...
    current_user_id_str = get_jwt_identity()
    try: admin_oid = ObjectId(current_user_id_str)
    except Exception: return jsonify({"error": "Invalid admin identity"}), 400

    admin_user = mongo.db.users.find_one({"_id": admin_oid})
    if not admin_user or admin_user.get("role") != "admin":
        return jsonify({"error": "Unauthorized"}), 403

    data = request.get_json()
    name = data.get("name", "").strip()
    email = data.get("email", "").lower().strip()
    role = data.get("role", "user").strip()
    password = data.get("password")

    if not name or not email or not password: return jsonify({"error": "Name, email, password required"}), 400
    if role not in ["user", "admin"]: return jsonify({"error": "Invalid role"}), 400
    if not re.match(r"[^@]+@[^@]+\.[^@]+", email): return jsonify({"error": "Invalid email"}), 400
    if len(password) < 6: return jsonify({"error": "Password too short"}), 400
    if mongo.db.users.find_one({"email": email}): return jsonify({"error": "Email already in use"}), 400

    try:
        hashed_password = generate_password_hash(password)
        user_doc = {
            "name": name, "email": email, "role": role, "password_hash": hashed_password,
            "created_at": datetime.now(timezone.utc), "created_by": admin_oid
        }
        result = mongo.db.users.insert_one(user_doc)
        new_user_id = result.inserted_id

        created_user = mongo.db.users.find_one({"_id": new_user_id}, {"password_hash": 0})

        return jsonify({ "message": "User created", "user": created_user }), 201
    except Exception as e:
        print(f"Error admin creating user: {e}")
        return jsonify({"error": "Server error creating user"}), 500

@app.route('/api/admin/users/<user_id>', methods=['PUT'])
@jwt_required()
def admin_update_user(user_id):
    # ... (Keep implementation from previous corrected version) ...
    current_user_id_str = get_jwt_identity()
    try: admin_oid = ObjectId(current_user_id_str)
    except Exception: return jsonify({"error": "Invalid admin identity"}), 400

    admin_user = mongo.db.users.find_one({"_id": admin_oid})
    if not admin_user or admin_user.get("role") != "admin": return jsonify({"error": "Unauthorized"}), 403
    if not ObjectId.is_valid(user_id): return jsonify({"error": "Invalid user ID format"}), 400
    target_user_oid = ObjectId(user_id)
    # if admin_oid == target_user_oid: return jsonify({"error": "Cannot modify own account here"}), 403

    data = request.get_json()
    update_fields = {}

    if "name" in data:
        name = data["name"].strip()
        if name: update_fields["name"] = name
        else: return jsonify({"error": "Name cannot be empty"}), 400
    if "email" in data:
        email = data["email"].lower().strip()
        if not re.match(r"[^@]+@[^@]+\.[^@]+", email): return jsonify({"error": "Invalid email"}), 400
        existing = mongo.db.users.find_one({"email": email, "_id": {"$ne": target_user_oid}})
        if existing: return jsonify({"error": "Email already used by another user"}), 400
        update_fields["email"] = email
    if "role" in data:
        role = data["role"].strip()
        if role not in ["user", "admin"]: return jsonify({"error": "Invalid role"}), 400
        update_fields["role"] = role
    if data.get("password"):
        password = data["password"]
        if len(password) < 6: return jsonify({"error": "Password too short"}), 400
        update_fields["password_hash"] = generate_password_hash(password)

    if not update_fields: return jsonify({"error": "No valid fields to update"}), 400
    update_fields["last_updated_at"] = datetime.now(timezone.utc)

    try:
        result = mongo.db.users.update_one({"_id": target_user_oid}, {"$set": update_fields})
        if result.matched_count == 0: return jsonify({"error": "User not found"}), 404
        if result.modified_count == 0: return jsonify({"message": "No changes detected"}), 200

        updated_user = mongo.db.users.find_one({"_id": target_user_oid}, {"password_hash": 0})
        return jsonify({"message": "User updated", "user": updated_user}), 200
    except Exception as e:
        print(f"Error admin updating user {user_id}: {e}")
        return jsonify({"error": "Server error updating user"}), 500

@app.route('/api/admin/users/<user_id>', methods=['DELETE'])
@jwt_required()
def admin_delete_user(user_id):
    # ... (Keep implementation from previous corrected version) ...
    current_user_id_str = get_jwt_identity()
    try: admin_oid = ObjectId(current_user_id_str)
    except Exception: return jsonify({"error": "Invalid admin identity"}), 400

    admin_user = mongo.db.users.find_one({"_id": admin_oid})
    if not admin_user or admin_user.get("role") != "admin": return jsonify({"error": "Unauthorized"}), 403
    if not ObjectId.is_valid(user_id): return jsonify({"error": "Invalid user ID format"}), 400
    target_user_oid = ObjectId(user_id)
    if admin_oid == target_user_oid: return jsonify({"error": "Cannot delete own account"}), 403

    try:
        user_to_delete = mongo.db.users.find_one({"_id": target_user_oid}, {"_id": 1})
        if not user_to_delete: return jsonify({"error": "User not found"}), 404

        result = mongo.db.users.delete_one({"_id": target_user_oid})
        if result.deleted_count == 0: return jsonify({"error": "Deletion failed unexpectedly"}), 500

        print(f"User {user_id} deleted by admin {admin_oid}")
        # Optional cleanup (consider consequences)
        # mongo.db.quiz_submissions.delete_many({"user_id": target_user_oid})
        # mongo.db.quiz_registrations.delete_many({"user_id": target_user_oid})
        # mongo.db.recommendations.delete_many({"user_id": target_user_oid})

        return jsonify({"message": "User deleted successfully"}), 200
    except Exception as e:
        print(f"Error admin deleting user {user_id}: {e}")
        return jsonify({"error": "Server error deleting user"}), 500


# --- Analytics Routes (Admin) ---
# Keep implementations from previous corrected version for:
# /api/admin/analytics (dashboard stats)
# /api/admin/analytics/quiz-completions (time series)
# /api/admin/analytics/user-activity (time series)
# /api/admin/analytics/top-quizzes (table)
# /api/admin/analytics/category-distribution (pie chart)
# They use UTC comparisons and rely on encoder for output formatting.  

@app.route('/api/admin/analytics', methods=['GET'])
@jwt_required()
def get_admin_dashboard_analytics():
    # ... (Keep implementation from previous corrected version) ...
    current_user_id_str = get_jwt_identity()
    try: admin_oid = ObjectId(current_user_id_str)
    except Exception: return jsonify({"error": "Invalid admin identity"}), 400

    admin_user = mongo.db.users.find_one({"_id": admin_oid})
    if not admin_user or admin_user.get('role') != 'admin': return jsonify({"error": "Unauthorized"}), 403

    try:
        total_users = mongo.db.users.count_documents({})
        total_quizzes = mongo.db.quizzes.count_documents({})
        total_submissions = mongo.db.quiz_submissions.count_documents({})

        popular_topic_pipeline = [
            {"$lookup": {"from": "quizzes", "localField": "quiz_id", "foreignField": "_id", "as": "quizInfo"}},
            {"$unwind": "$quizInfo"},
            {"$group": {"_id": "$quizInfo.topic", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}}, {"$limit": 1}
        ]
        popular_topic_result = list(mongo.db.quiz_submissions.aggregate(popular_topic_pipeline))
        most_popular_topic = popular_topic_result[0]['_id'] if popular_topic_result else "N/A"

        active_quizzes = mongo.db.quizzes.count_documents({"status": {"$in": ["active", "reviewed"]}}) # Count active/reviewed
        upcoming_scheduled = mongo.db.quizzes.count_documents({"status": "scheduled", "scheduled_datetime": {"$gt": datetime.now(timezone.utc)}})

        return jsonify({
            "total_users": total_users if total_users is not None else "N/A",
            "total_quizzes": total_quizzes if total_quizzes is not None else "N/A",
            "total_submissions": total_submissions if total_submissions is not None else "N/A",
            "most_popular_topic": most_popular_topic,
            "active_quizzes": active_quizzes,
            "upcoming_scheduled_quizzes": upcoming_scheduled
        }), 200
    except Exception as e:
        print(f"Error fetching admin dashboard analytics: {e}")
        # Return N/A for all fields on error
        return jsonify({
            "total_users": "N/A", "total_quizzes": "N/A", "total_submissions": "N/A",
            "most_popular_topic": "N/A", "active_quizzes": "N/A", "upcoming_scheduled_quizzes": "N/A",
            "error": "Failed to fetch analytics"
        }), 500 # Still indicate server error status


@app.route('/api/admin/analytics/quiz-completions', methods=['GET'])
@jwt_required()
def get_quiz_completions_over_time():
    # ... (Keep implementation from previous corrected version) ...
    user_id_str = get_jwt_identity()
    user = mongo.db.users.find_one({"_id": ObjectId(user_id_str)})
    if not user or user.get('role') != 'admin': return jsonify({"error": "Unauthorized"}), 403

    range_param = request.args.get("range", "month").lower()
    if range_param not in ['week', 'month', 'year']: return jsonify({"error": "Invalid range"}), 400

    now_utc = datetime.now(timezone.utc)
    date_format = "%Y-%m-%d" # Default for day grouping
    if range_param == "week": start_utc = now_utc - timedelta(weeks=1)
    elif range_param == "year":
        start_utc = now_utc - timedelta(days=365)
        date_format = "%Y-%m" # Group by month for year view
    else: start_utc = now_utc - timedelta(days=30)

    try:
        pipeline = [
            {"$match": {"submitted_at": {"$gte": start_utc, "$lte": now_utc}}},
            {"$group": {
                "_id": {"$dateToString": {"format": date_format, "date": "$submitted_at", "timezone": "Asia/Kolkata"}}, # Group in IST
                "count": {"$sum": 1}
            }},
            {"$sort": {"_id": 1}}
        ]
        results = list(mongo.db.quiz_submissions.aggregate(pipeline))
        chart_data = [{"date": item["_id"], "value": item["count"]} for item in results]
        return jsonify({"data": chart_data}), 200
    except Exception as e:
         print(f"Error fetching quiz completions analytics: {e}")
         return jsonify({"error": "Failed to fetch data"}), 500

@app.route('/api/admin/analytics/user-activity', methods=['GET'])
@jwt_required()
def get_user_activity_over_time():
    # ... (Keep implementation from previous corrected version) ...
    user_id_str = get_jwt_identity()
    user = mongo.db.users.find_one({"_id": ObjectId(user_id_str)})
    if not user or user.get('role') != 'admin': return jsonify({"error": "Unauthorized"}), 403

    range_param = request.args.get("range", "month").lower()
    if range_param not in ['week', 'month', 'year']: return jsonify({"error": "Invalid range"}), 400

    now_utc = datetime.now(timezone.utc)
    date_format = "%Y-%m-%d"
    if range_param == "week": start_utc = now_utc - timedelta(weeks=1)
    elif range_param == "year":
        start_utc = now_utc - timedelta(days=365)
        date_format = "%Y-%m"
    else: start_utc = now_utc - timedelta(days=30)

    try:
        pipeline = [
            {"$match": {"submitted_at": {"$gte": start_utc, "$lte": now_utc}}},
            {"$group": {
                "_id": {"$dateToString": {"format": date_format, "date": "$submitted_at", "timezone": "Asia/Kolkata"}},
                "active_users_set": {"$addToSet": "$user_id"}
            }},
            {"$project": {"_id": 0, "date": "$_id", "active_users": {"$size": "$active_users_set"}}},
            {"$sort": {"date": 1}}
        ]
        results = list(mongo.db.quiz_submissions.aggregate(pipeline))
        chart_data = [{"date": item["date"], "value": item["active_users"]} for item in results]
        return jsonify({"data": chart_data}), 200
    except Exception as e:
         print(f"Error fetching user activity analytics: {e}")
         return jsonify({"error": "Failed to fetch data"}), 500

@app.route('/api/admin/analytics/top-quizzes', methods=['GET'])
@jwt_required()
def get_top_quizzes_analytics():
    user_id_str = get_jwt_identity()
    try:
        user_oid = ObjectId(user_id_str)
        user = mongo.db.users.find_one({"_id": user_oid})
        if not user or user.get('role') != 'admin':
            return jsonify({"error": "Unauthorized"}), 403
    except Exception:
        return jsonify({"error": "Invalid user identity"}), 400

    limit = int(request.args.get("limit", 10))
    if limit < 1: limit = 1
    if limit > 50: limit = 50

    try:
        # --- MODIFIED PIPELINE ---
        pipeline = [
            {"$group": {
                "_id": "$quiz_id",
                "completions": {"$sum": 1},
                "average_score": {"$avg": "$score"},
                "total_possible": {"$first": "$total"},
                # Get topic and type from the submission document itself
                "topic": {"$first": "$quiz_topic"},
                "type": {"$first": "$quiz_type"}
            }},
            {"$sort": {"completions": -1}},
            {"$limit": limit}
            # REMOVED: $lookup and $unwind stages are no longer needed for topic/type
        ]
        # --- END MODIFIED PIPELINE ---

        results = list(mongo.db.quiz_submissions.aggregate(pipeline))
        quizzes_data = []
        for r in results:
            # --- UPDATED: Get topic/type directly from aggregation result ---
            topic = r.get("topic", "N/A") # Default if somehow missing from submission
            quiz_type = r.get("type", "") # Default if somehow missing
            # --- END UPDATE ---

            total = r.get("total_possible", 0)
            avg_score = r.get("average_score", 0)
            avg_perc = round((avg_score / total) * 100, 1) if total and total > 0 else 0 # Added check total > 0

            quizzes_data.append({
                "_id": str(r["_id"]),
                # Construct title using fetched topic/type
                "title": f"{quiz_type} - {topic}".strip(" -") if quiz_type and topic != "N/A" else topic,
                "completions": r.get("completions", 0),
                "average_score": round(avg_score, 2),
                "total_possible": total,
                "average_percentage": avg_perc
            })
        return jsonify({"quizzes": quizzes_data}), 200
    except Exception as e:
        print(f"Error fetching top quizzes analytics: {e}")
        import traceback
        traceback.print_exc() # Print full traceback for debugging
        return jsonify({"error": "Failed to fetch data"}), 500

@app.route('/api/admin/analytics/category-distribution', methods=['GET'])
@jwt_required()
def get_quiz_category_distribution():
    # ... (Keep implementation from previous corrected version) ...
    user_id_str = get_jwt_identity()
    user = mongo.db.users.find_one({"_id": ObjectId(user_id_str)})
    if not user or user.get('role') != 'admin': return jsonify({"error": "Unauthorized"}), 403

    try:
        pipeline = [
            {"$match": {"type": {"$ne": None}}}, # Exclude quizzes with no type
            {"$group": {"_id": "$type", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}}
        ]
        results = list(mongo.db.quizzes.aggregate(pipeline))
        # Format for chart { name: 'Category', value: count }
        categories_data = [{"name": r["_id"], "value": r["count"]} for r in results]
        return jsonify({"categories": categories_data}), 200
    except Exception as e:
         print(f"Error fetching category distribution analytics: {e}")
         return jsonify({"error": "Failed to fetch data"}), 500

# --- Misc Routes ---

@app.route('/api/recommendations', methods=['GET'])
@jwt_required()
def get_recommendations():
    # ... (Keep implementation from previous corrected version) ...
    # Fetches user-specific or trending topics.
    current_user_id_str = get_jwt_identity()
    try: user_oid = ObjectId(current_user_id_str)
    except Exception: return jsonify({"error": "Invalid user identity"}), 400

    try:
        user_recs = mongo.db.recommendations.find_one({"user_id": user_oid})
        if user_recs and user_recs.get("topics"):
            recommended_topics = user_recs.get("topics")
        else:
            recommended_topics = get_trending_topics()
        return jsonify({"recommendations": recommended_topics}), 200
    except Exception as e:
        print(f"Error fetching recommendations for {user_oid}: {e}")
        return jsonify({"error": "Internal server error"}), 500


@app.route('/api/admin/user/<user_id>/history', methods=['DELETE'])
@jwt_required()
def reset_user_history(user_id):
    # ... (Keep implementation from previous corrected version) ...
    # Admin clears user's submissions, registrations, recommendations.
    current_user_id_str = get_jwt_identity()
    try: admin_oid = ObjectId(current_user_id_str)
    except Exception: return jsonify({"error": "Invalid admin identity"}), 400

    admin_user = mongo.db.users.find_one({"_id": admin_oid})
    if not admin_user or admin_user.get('role') != 'admin': return jsonify({"error": "Unauthorized"}), 403
    if not ObjectId.is_valid(user_id): return jsonify({"error": "Invalid user ID format"}), 400
    target_user_oid = ObjectId(user_id)

    try:
        sub_res = mongo.db.quiz_submissions.delete_many({"user_id": target_user_oid})
        reg_res = mongo.db.quiz_registrations.delete_many({"user_id": target_user_oid})
        rec_res = mongo.db.recommendations.delete_one({"user_id": target_user_oid})
        counts = {"submissions": sub_res.deleted_count, "registrations": reg_res.deleted_count, "recommendations": rec_res.deleted_count}
        print(f"Reset history for user {user_id} by admin {admin_oid}. Deleted: {counts}")
        return jsonify({"message": "User history reset.", "details": counts}), 200
    except Exception as e:
        print(f"Error resetting history for user {user_id}: {e}")
        return jsonify({"error": "Failed to reset history"}), 500


@app.route('/api/health', methods=['GET'])
def health_check():
    # ... (Keep implementation from previous corrected version) ...
    try:
        mongo.cx.server_info() # Check DB connection
        db_status = "connected"
    except Exception as e:
        print(f"Health Check DB Error: {e}")
        db_status = "error"
    return jsonify({
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "database_status": db_status
    }), 200


@app.route('/api/create-admin', methods=['POST'])
def create_admin():
    # WARNING: This route allows creating an admin potentially without authentication,
    # relying only on a hardcoded secret key. Use with extreme caution, ideally only
    # for initial setup and then disable or protect it properly.
    data = request.get_json()
    name = data.get('name')
    email = data.get('email')
    password = data.get('password')
    secret_key = data.get('secret_key') # The "password" to use this endpoint

    # Use a strong, environment-variable-based secret key if keeping this endpoint
    ADMIN_CREATION_SECRET = os.getenv("ADMIN_CREATION_SECRET", "change-this-in-env-file")
    if not ADMIN_CREATION_SECRET or secret_key != ADMIN_CREATION_SECRET:
        print(f"Failed admin creation attempt with key: {secret_key}")
        return jsonify({"error": "Unauthorized: Invalid secret key"}), 403

    if not name or not email or not password: return jsonify({"error": "All fields required"}), 400
    if mongo.db.users.find_one({"email": email.lower()}): return jsonify({"error": "Email already registered"}), 400

    password_hash = generate_password_hash(password)
    user_id = mongo.db.users.insert_one({
        "name": name, "email": email.lower(), "password_hash": password_hash,
        "role": "admin", "created_at": datetime.now(timezone.utc)
    }).inserted_id

    # Don't automatically log in the created admin, just confirm creation
    return jsonify({
        "message": "Admin created successfully",
        "user": {"id": str(user_id), "name": name, "email": email.lower(), "role": "admin"}
    }), 201

@app.route('/api/promote-to-admin', methods=['POST'])
def promote_to_admin():
    # WARNING: Similar security concerns as /api/create-admin. Protect this route.
    data = request.get_json()
    email = data.get('email')
    secret_key = data.get('secret_key')

    ADMIN_PROMOTION_SECRET = os.getenv("ADMIN_PROMOTION_SECRET", "change-this-too")
    if not ADMIN_PROMOTION_SECRET or secret_key != ADMIN_PROMOTION_SECRET:
        print(f"Failed admin promotion attempt with key: {secret_key}")
        return jsonify({"error": "Unauthorized: Invalid secret key"}), 403

    if not email: return jsonify({"error": "Email is required"}), 400

    result = mongo.db.users.update_one(
        {"email": email.lower()},
        {"$set": {"role": "admin", "last_updated_at": datetime.now(timezone.utc)}}
    )

    if result.matched_count == 0: return jsonify({"error": "User not found"}), 404
    if result.modified_count == 0: return jsonify({"message": f"User {email} is already an admin."}), 200

    return jsonify({"message": f"User {email} promoted to admin successfully"}), 200

# --- Main Execution ---
if __name__ == '__main__':
    # Use 0.0.0.0 to be accessible from frontend (running in different container/origin)
    app.run(port=5000, debug=True) # Default port 5000