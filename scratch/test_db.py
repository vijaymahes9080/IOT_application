import pypyodbc
import os
import json

with open('config.json', 'r') as f:
    config = json.load(f)

db_path = os.path.abspath(config['database']['filename'])
print(f"Testing connection to: {db_path}")

if not os.path.exists(db_path):
    print("Database file does not exist locally.")
else:
    try:
        conn_str = f"Driver={{Microsoft Access Driver (*.mdb, *.accdb)}};DBQ={db_path};"
        conn = pypyodbc.connect(conn_str)
        print("Success: Connected to MS Access Database via pypyodbc.")
        conn.close()
    except Exception as e:
        print(f"Error: {e}")
