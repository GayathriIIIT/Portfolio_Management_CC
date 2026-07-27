import os

from dotenv import load_dotenv

load_dotenv()

from app import create_app  # noqa: E402

app = create_app()

if __name__ == "__main__":
    app.run(debug=bool(int(os.environ.get("FLASK_DEBUG", "1"))))
