require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000;

const CSV_URL = 'https://raw.githubusercontent.com/shgo9573/minyanim/refs/heads/main/zmanim.csv'; 

function cleanForTTS(str) {
    if (!str) return '';
    // ניקוי תווים מיוחדים אבל שמירה על גרשיים של ראשי תיבות אם צריך
    return str.replace(/[.\-"&%=]/g, ' ').replace(/\s+/g, ' ').trim();
}

app.get('/minyan', async (req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  const timeLog = new Date().toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem' });

  console.log(`\n\n========== [${timeLog}] פנייה חדשה ==========`);
  
  let history = [];
  if (Array.isArray(req.query.menu_choice)) {
      history = req.query.menu_choice;
  } else if (req.query.menu_choice) {
      history = [req.query.menu_choice];
  }

  try {
    const response = await axios.get(CSV_URL);
    const csvData = response.data;
    const rows = csvData.split(/\r?\n/);
    let minyanim = [];
    let lastValidMinutes = 0;

    for (let i = 1; i < rows.length; i++) {
      let row = rows[i].trim();
      if (!row || row === ',,,') continue; // דילוג על שורות ריקות לגמרי

      const columns = row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
      if (columns.length < 4) continue;

      const clean = (str) => str ? str.replace(/"/g, '').trim() : '';
      
      const type = clean(columns[0]);
      const shul = clean(columns[1]);
      const location = clean(columns[2]);
      const timeStr = clean(columns[3]);

      if (!type && !shul && !timeStr) continue; // שורה ריקה מתוכן

      let currentMinutes = 0;
      if (timeStr && timeStr.includes(':')) {
          // מדובר בשעה רגילה (08:15)
          const parts = timeStr.split(':');
          currentMinutes = parseInt(parts[0]) * 60 + parseInt(parts[1]);
          lastValidMinutes = currentMinutes;
      } else if (timeStr || shul || type) {
          // מדובר בשורת טקסט (כמו "20 דקות לפני השקיעה")
          // נותנים לה דקה אחת אחרי המניין הקודם כדי לשמור על הסדר
          currentMinutes = lastValidMinutes + 1;
          lastValidMinutes = currentMinutes;
      } else {
          continue;
      }

      minyanim.push({
        type: type,
        shul: shul,
        location: location,
        time: timeStr,
        minutes: currentMinutes
      });
    }

    if (minyanim.length === 0) {
        return res.send(`id_list_message=t-לא נמצאו מניינים בקובץ&hangup=yes`);
    }

    // חישוב זמן נוכחי בישראל
    const now = new Date();
    const israelTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Jerusalem"}));
    const curMin = israelTime.getHours() * 60 + israelTime.getMinutes();
    
    // מציאת המניין הראשון שמתאים לעכשיו
    let startIndex = minyanim.findIndex(m => m.minutes >= curMin);
    let isTomorrow = false;

    if (startIndex === -1) {
        startIndex = 0;
        isTomorrow = true;
    }

    let currentIndex = startIndex;

    // ניווט לפי היסטוריה
    for (let move of history) {
        if (move === '1') { 
            if (currentIndex < minyanim.length - 1) currentIndex++;
        } else if (move === '2') { 
            if (currentIndex > 0) currentIndex--;
        }
    }

    const lastMove = history.length > 0 ? history[history.length - 1] : null;

    if (lastMove === '4') {
        return res.send(`id_list_message=t-להתראות&hangup=yes`);
    }

    let textToRead = "";
    
    if (lastMove === '3') {
        let all = minyanim.map(m => {
            let parts = [];
            if (m.type) parts.push(`תפילת ${m.type}`);
            if (m.shul) parts.push(`ב${m.shul}`);
            if (m.time) parts.push(`בשעה ${m.time}`);
            return parts.join(' ');
        }).join('. ');
        textToRead = cleanForTTS("רשימת כל המניינים היא " + all);
    } else {
        const m = minyanim[currentIndex];
        let prefix = "";
        
        if (history.length === 0) {
            prefix = isTomorrow ? "לא נותרו מניינים להיום. מנייני מחר הם: " : "המניין הקרוב ביותר הוא: ";
        } else {
            if (currentIndex === 0 && lastMove === '2') prefix = "זהו המניין הראשון. ";
            if (currentIndex === minyanim.length - 1 && lastMove === '1') prefix = "זהו המניין האחרון. ";
        }

        let mDetails = [];
        if (m.type) mDetails.push(`תפילת ${m.type}`);
        if (m.shul) mDetails.push(`ב${m.shul}`);
        if (m.time) {
            // אם הזמן מכיל נקודותיים זו שעה, אם לא זה טקסט חופשי
            let timePrefix = m.time.includes(':') ? "בשעה" : "";
            mDetails.push(`${timePrefix} ${m.time}`);
        }

        textToRead = cleanForTTS(`${prefix} ${mDetails.join(' ')}`);
    }

    const menu = cleanForTTS("לשמיעה חוזרת הקש אפס. למניין הבא אחת. לקודם שתיים. לכל המניינים שלוש. ליציאה ארבע.");
    const responseString = `read=t-${textToRead} ${menu}=menu_choice,number,1,1,7,no,no,no`;
    
    res.send(responseString);
    console.log(`[LOG] הושמע: ${textToRead}`);

  } catch (error) {
    console.error("[ERROR] שגיאה:", error.message);
    res.send(`id_list_message=t-שגיאה במערכת&hangup=yes`);
  }
});

app.listen(port, () => console.log(`Server running on port ${port}`));

