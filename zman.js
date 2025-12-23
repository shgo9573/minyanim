const express = require('express');
const axios = require('axios');
const app = express();
const port = process.env.PORT || 3000;

// הקישור ל-CSV שלך
const CSV_URL = 'https://raw.githubusercontent.com/shgo9573/minyanim/refs/heads/main/zmanim.csv'; 

// פונקציית ניקוי טקסט
function cleanForTTS(str) {
    if (!str) return '';
    return str.replace(/[.,\-"\'&%=]/g, ' ').replace(/\s+/g, ' ').trim();
}

// נתיב ראשי - כדי שנוכל לראות אם השרת בכלל חי
app.get('/', (req, res) => {
    console.log("Ping received on root /");
    res.send('Server is active. Please use /minyan');
});

// הנתיב של המערכת
app.get('/minyan', async (req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');

    // ==========================================
    // לוגים: חובה לראות את זה בלוגים של Render
    // ==========================================
    console.log(">>> כניסה חדשה למערכת (/minyan) <<<");
    console.log("הפרמטרים שהתקבלו מימות המשיח:", JSON.stringify(req.query, null, 2));

    const menuChoice = req.query.menu_choice; 
    let minyanIndex = req.query.minyan_index;

    try {
        const response = await axios.get(CSV_URL);
        const csvData = response.data;
        const rows = csvData.split(/\r?\n/);
        let minyanim = [];

        for (let i = 1; i < rows.length; i++) {
            let row = rows[i].trim();
            if (!row) continue;
            const columns = row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
            if (columns.length < 4) continue;
            const clean = (str) => str ? str.replace(/"/g, '').trim() : '';
            const timeStr = clean(columns[3]);
            if (!timeStr || !timeStr.includes(':')) continue;

            const parts = timeStr.split(':');
            minyanim.push({
                type: clean(columns[0]),
                shul: clean(columns[1]),
                time: timeStr,
                minutes: parseInt(parts[0]) * 60 + parseInt(parts[1])
            });
        }

        minyanim.sort((a, b) => a.minutes - b.minutes);

        let index;
        let prefix = "";

        // בדיקה אם זו כניסה ראשונה (אין minyan_index)
        if (!minyanIndex || minyanIndex === 'undefined') {
            console.log("--- חישוב מניין ראשון לפי שעה ---");
            const now = new Date();
            const israelTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Jerusalem"}));
            const curMin = israelTime.getHours() * 60 + israelTime.getMinutes();
            
            index = minyanim.findIndex(m => m.minutes >= curMin);
            if (index === -1) { 
                index = 0; 
                prefix = "לא נמצאו מניינים נוספים להיום מנייני מחר "; 
            }
        } else {
            // כניסה חוזרת (יש minyan_index)
            index = parseInt(minyanIndex);
            console.log(`--- המשך ממניין מספר: ${index} ---`);

            if (menuChoice === '1') { // הבא
                if (index < minyanim.length - 1) index++;
                else prefix = "זהו המניין האחרון ";
            } else if (menuChoice === '2') { // קודם
                if (index > 0) index--;
                else prefix = "זהו המניין הראשון ";
            } else if (menuChoice === '3') { // הכל
                let all = minyanim.map(m => `${m.type} ב${m.shul} בשעה ${m.time}`).join(' ');
                return res.send(`id_list_message=t-${cleanForTTS("כל המניינים הם " + all)}&go_to_folder=./`);
            } else if (menuChoice === '4') { // יציאה
                return res.send(`id_list_message=t-להתראות&hangup=yes`);
            }
        }

        const m = minyanim[index];
        const details = cleanForTTS(`${prefix} תפילת ${m.type} ב${m.shul} בשעה ${m.time}`);
        const menu = cleanForTTS("לשמיעה חוזרת הקש אפס למניין הבא אחת לקודם שתיים לכל המניינים שלוש ליציאה ארבע");

        // השיטה שעובדת: שרשור המשתנה בסוף הלינק
        const responseString = `read=t-${details} ${menu}=menu_choice,number,1,1,7,no,no,no&minyan_index=${index}`;
        
        console.log("תגובה נשלחת:", responseString);
        res.send(responseString);

    } catch (error) {
        console.error("Critical Error:", error.message);
        res.send(`id_list_message=t-שגיאה במערכת&go_to_folder=/hangup`);
    }
});

app.listen(port, () => console.log(`Server running on port ${port}`));
