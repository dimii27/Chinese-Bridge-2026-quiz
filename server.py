import http.server
import socketserver
import json
import os
import urllib.parse

PORT = int(os.environ.get("PORT", 8000))
DATA_DIR = "data"

if not os.path.exists(DATA_DIR):
    os.makedirs(DATA_DIR)

class MyHttpRequestHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        # Admin API: List all users and their basic stats
        if self.path == '/api/admin/users':
            user_files = [f for f in os.listdir(DATA_DIR) if f.endswith('.json')]
            users_data = []
            for filename in user_files:
                username = filename[:-5]
                filepath = os.path.join(DATA_DIR, filename)
                try:
                    with open(filepath, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                        # Calc stats
                        mastered = 0
                        learning = 0
                        for q_id, p in data.items():
                            if p.get('interval', 0) >= 4320: mastered += 1
                            elif p.get('interval', 0) >= 1440: learning += 1
                        users_data.append({
                            "username": username,
                            "stats": {"mastered": mastered, "learning": learning}
                        })
                except:
                    pass
            
            self.send_response(200)
            self.send_header("Content-type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(users_data).encode('utf-8'))
            return

        # Handle API GET requests
        if self.path.startswith('/api/progress/'):
            username = urllib.parse.unquote(self.path.split('/')[-1])
            filepath = os.path.join(DATA_DIR, f"{username}.json")
            
            self.send_response(200)
            self.send_header("Content-type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            
            if os.path.exists(filepath):
                with open(filepath, 'r', encoding='utf-8') as f:
                    self.wfile.write(f.read().encode('utf-8'))
            else:
                self.wfile.write(b"{}")
            return
            
        # Fallback to serving static files
        return super().do_GET()

    def do_POST(self):
        # Handle API POST requests
        if self.path.startswith('/api/progress/'):
            username = urllib.parse.unquote(self.path.split('/')[-1])
            filepath = os.path.join(DATA_DIR, f"{username}.json")
            
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(post_data.decode('utf-8'))
                
            self.send_response(200)
            self.send_header("Content-type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"success": True}).encode('utf-8'))
            return

    def do_DELETE(self):
        # Admin API: Reset/Delete a user's progress
        if self.path.startswith('/api/admin/users/'):
            target_user = urllib.parse.unquote(self.path.split('/')[-1])
            filepath = os.path.join(DATA_DIR, f"{target_user}.json")
            if os.path.exists(filepath):
                os.remove(filepath)
            
            self.send_response(200)
            self.send_header("Content-type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"success": True}).encode('utf-8'))
            return
            
    def do_OPTIONS(self):
        self.send_response(200, "ok")
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS, POST, DELETE')
        self.send_header("Access-Control-Allow-Headers", "X-Requested-With, Content-Type")
        self.end_headers()

Handler = MyHttpRequestHandler

# Bind to 0.0.0.0 for Render.com and other cloud platforms
with socketserver.TCPServer(("0.0.0.0", PORT), Handler) as httpd:
    print(f"Serving at port {PORT}")
    httpd.serve_forever()
