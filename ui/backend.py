from flask import Flask, jsonify, request, send_file
from flask_cors import CORS
import subprocess
import os
import sys

app = Flask(__name__)
CORS(app)

# The path to the asteroid detection script
SCRIPT_PATH = os.path.join(os.path.dirname(__file__), "..", "asteriod_detection.py")
RESULT_IMAGE = os.path.join(os.path.dirname(__file__), "..", "latest_result.png")

@app.route('/get-latest-plot', methods=['GET'])
def get_latest_plot():
    if os.path.exists(RESULT_IMAGE):
        return send_file(RESULT_IMAGE, mimetype='image/png')
    else:
        return jsonify({"error": "Plot not found"}), 404

@app.route('/run-pipeline', methods=['POST'])
def run_pipeline():
    try:
        # Run the python script
        # We use sys.executable to use the same python interpreter
        result = subprocess.run(
            [sys.executable, SCRIPT_PATH, '--headless', '--quick'],
            capture_output=True,
            text=True,
            timeout=900 # 15 minute safety timeout
        )
        
        return jsonify({
            "status": "success" if result.returncode == 0 else "error",
            "stdout": result.stdout,
            "stderr": result.stderr,
            "code": result.returncode
        })
    except subprocess.TimeoutExpired:
        return jsonify({
            "status": "error",
            "message": "The analysis timed out (exceeded 15 minutes). Consider using fewer frames.",
            "stdout": "",
            "stderr": "TimeoutExpired"
        }), 504
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e),
            "stdout": "",
            "stderr": str(e)
        }), 500

if __name__ == '__main__':
    # Running on 7892 to avoid conflict with the static server on 7891
    # Bind to 0.0.0.0 and disable reloader for stability
    app.run(host='0.0.0.0', port=7892, debug=False)
