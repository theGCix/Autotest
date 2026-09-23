#!/usr/bin/env python3
"""
Genera data/sync-config.js a partir de un archivo .env.

Uso:
    python3 tools/gen_sync_config.py            # lee ./.env
    python3 tools/gen_sync_config.py .env.tab02  # lee otro archivo

No requiere librerías externas (no usa python-dotenv) para que funcione
en cualquier máquina sin instalar nada extra.
"""
import sys
import os
import json

DEFAULTS = {
    "TOPS_SYNC_ENABLED": "false",
    "TOPS_SUPABASE_URL": "",
    "TOPS_SUPABASE_ANON_KEY": "",
    "TOPS_DEVICE_EMAIL": "",
    "TOPS_DEVICE_PASSWORD": "",
    "TOPS_DEVICE_ID": "TOPS-TAB-01",
    "TOPS_SYNC_INTERVAL_MS": "45000",
    "TOPS_SYNC_BATCH_SIZE": "50",
}


def load_env(path):
    values = dict(DEFAULTS)
    if not os.path.exists(path):
        print(f"⚠️  No existe {path}. Copia .env.example a .env y complétalo.")
        sys.exit(1)
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            values[key.strip()] = val.strip()
    return values


def js_str(value):
    return json.dumps(value)


def main():
    env_path = sys.argv[1] if len(sys.argv) > 1 else ".env"
    v = load_env(env_path)

    enabled = v["TOPS_SYNC_ENABLED"].strip().lower() in ("1", "true", "yes")

    out = f"""/*
 * GENERADO desde {os.path.basename(env_path)} por tools/gen_sync_config.py
 * No edites este archivo a mano: los cambios se pierden si vuelves a
 * correr el script. Edita el .env de esta tablet y vuelve a generar.
 */
window.TOPS_CONFIG = window.TOPS_CONFIG || {{}};
window.TOPS_CONFIG.sync = {{
  enabled: {str(enabled).lower()},
  supabaseUrl: {js_str(v["TOPS_SUPABASE_URL"])},
  supabaseAnonKey: {js_str(v["TOPS_SUPABASE_ANON_KEY"])},
  deviceEmail: {js_str(v["TOPS_DEVICE_EMAIL"])},
  devicePassword: {js_str(v["TOPS_DEVICE_PASSWORD"])},
  deviceId: {js_str(v["TOPS_DEVICE_ID"])},
  intervalMs: {int(v["TOPS_SYNC_INTERVAL_MS"])},
  batchSize: {int(v["TOPS_SYNC_BATCH_SIZE"])}
}};
"""

    out_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "sync-config.js")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(out)
    print(f"✅ Generado {out_path} desde {env_path} (enabled={enabled})")


if __name__ == "__main__":
    main()
