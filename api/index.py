import os
import sys

# Ensure backend directory is in sys.path so internal backend imports work seamlessly on Vercel
backend_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'backend')
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from main import app

# Vercel entrypoint
__all__ = ["app"]
