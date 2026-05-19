import sys
import os
import subprocess
import json

# Gunakan path absolut ke skill xvary-stock-research
SKILL_PATH = r"C:\Users\ahamd\.gemini\antigravity\skills\xvary-stock-research\tools"

def run_market_tool(ticker: str):
    """Menjalankan market.py dari xvary-stock-research untuk mendapatkan data market real-time."""
    script_path = os.path.join(SKILL_PATH, "market.py")
    if not os.path.exists(script_path):
        return {"error": f"Tool market.py tidak ditemukan di {script_path}"}
    
    try:
        # Panggil market.py dan tangkap output JSON-nya
        result = subprocess.run(
            [sys.executable, script_path, ticker], 
            capture_output=True, 
            text=True, 
            timeout=15
        )
        if result.returncode != 0:
            return {"error": result.stderr}
        
        return json.loads(result.stdout)
    except Exception as e:
        return {"error": str(e)}

def run_edgar_tool(ticker: str):
    """Menjalankan edgar.py dari xvary-stock-research untuk data fundamental SEC."""
    script_path = os.path.join(SKILL_PATH, "edgar.py")
    if not os.path.exists(script_path):
        return {"error": f"Tool edgar.py tidak ditemukan di {script_path}"}
    
    try:
        # Ambil ringkasan facts perusahaan
        result = subprocess.run(
            [sys.executable, script_path, "--mode", "facts", ticker], 
            capture_output=True, 
            text=True, 
            timeout=15
        )
        if result.returncode != 0:
            return {"error": result.stderr}
        
        return json.loads(result.stdout)
    except Exception as e:
        return {"error": str(e)}

def analyze_stock(ticker: str) -> str:
    """Mengumpulkan data dan memberikan analisis scorecard dasar (Strategy Engine)."""
    ticker = ticker.upper().strip()
    print(f"Mengambil data pasar untuk {ticker}...")
    market_data = run_market_tool(ticker)
    
    #print(f"Mengambil data SEC EDGAR untuk {ticker}...")
    #edgar_data = run_edgar_tool(ticker)
    
    if "error" in market_data:
        return json.dumps({"status": "failed", "message": f"Gagal mengambil data market: {market_data['error']}"}, indent=2)

    # Mengekstrak data penting
    price = market_data.get("price")
    market_cap = market_data.get("market_cap")
    pe_ratio = market_data.get("pe_ratio")
    peg_ratio = market_data.get("peg_ratio")
    high_52 = market_data.get("fifty_two_week_high")
    low_52 = market_data.get("fifty_two_week_low")
    beta = market_data.get("beta")
    
    # Simple Strategy Engine / Scorecard
    score = 0
    max_score = 4
    analysis_notes = []

    # 1. Valuation (PE & PEG)
    if pe_ratio and isinstance(pe_ratio, (int, float)):
        if 0 < pe_ratio < 20:
            score += 1
            analysis_notes.append(f"Valuasi P/E menarik ({pe_ratio}).")
        elif pe_ratio >= 20:
            analysis_notes.append(f"Valuasi P/E cukup premium ({pe_ratio}).")
    
    # 2. Growth at a Reasonable Price (PEG)
    if peg_ratio and isinstance(peg_ratio, (int, float)):
        if 0 < peg_ratio < 1.5:
            score += 1
            analysis_notes.append(f"Valuasi PEG bagus untuk pertumbuhan ({peg_ratio}).")
        else:
            analysis_notes.append(f"Valuasi PEG tinggi, potensi overvalued relatif terhadap pertumbuhan ({peg_ratio}).")
    
    # 3. Momentum (Price relative to 52-week high)
    if price and high_52 and isinstance(price, (int, float)) and isinstance(high_52, (int, float)):
        distance_to_high = ((high_52 - price) / high_52) * 100
        if distance_to_high < 15: # Dalam 15% dari ATH
            score += 1
            analysis_notes.append(f"Momentum kuat (hanya {distance_to_high:.1f}% di bawah 52W High).")
        else:
            analysis_notes.append(f"Harga turun {distance_to_high:.1f}% dari 52W High.")
            
    # 4. Volatility / Risk (Beta)
    if beta and isinstance(beta, (int, float)):
        if beta < 1.2:
            score += 1
            analysis_notes.append(f"Volatilitas stabil (Beta: {beta}).")
        else:
            analysis_notes.append(f"Volatilitas tinggi, pergerakan agresif (Beta: {beta}).")

    # Rekomendasi berdasarkan skor
    if score >= 3:
        action = "BELI (BUY)"
    elif score == 2:
        action = "TAHAN (HOLD)"
    else:
        action = "JUAL / HINDARI (SELL/AVOID)"

    report = {
        "ticker": ticker,
        "raw_market_data": market_data,
        "scorecard": {
            "score": f"{score}/{max_score}",
            "action": action,
            "notes": analysis_notes
        }
    }
    
    return json.dumps(report, indent=2)

if __name__ == "__main__":
    if len(sys.argv) > 1:
        print(analyze_stock(sys.argv[1]))
    else:
        print("Usage: python stock_strategy.py <ticker>")
