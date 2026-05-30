import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// Use high-limit parser because clients send raw base64 images
app.use(express.json({ limit: "25mb" }));

// Dynamic GoogleGenAI client builder (Lazy-Init)
let aiClient: GoogleGenAI | null = null;
function getGemini(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY_MISSING");
    }
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// API: Plant Identification
app.post("/api/identify-plant", async (req, res) => {
  try {
    const { imageBase64, mimeType } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: "خواهشمند است ابتدا یک تصویر ارسال یا آپلود نمایید." });
    }

    let ai;
    try {
      ai = getGemini();
    } catch (err: any) {
      if (err.message === "GEMINI_API_KEY_MISSING") {
        return res.status(403).json({
          error: "کلید دسترسی Gemini یافت نشد. لطفاً کلید API را در پانل Secrets در تنظیمات AI Studio اضافه کنید.",
          code: "API_KEY_MISSING"
        });
      }
      throw err;
    }

    const currentMimeType = mimeType || "image/jpeg";
    const imagePart = {
      inlineData: {
        mimeType: currentMimeType,
        data: imageBase64,
      },
    };

    const textPart = {
      text: `Identify this plant in the photo. Act as the Supreme Royal Botanist of Cyaxares or Darius the Great in the Ancient Achaemenid Royal Gardens (Pardis).
Analyze the plant, its health, and formulate detailed Persian care instructions, historical context, and traditional values matching the requested JSON output format.
If the image is not a plant or cannot be identified as a plant, please try to identify what it is, but assign a very low confidence score (less than 15) and specify that in the summary.
Analyze carefully, translating all botanical instructions to clear, gorgeous Persian (Farsi).`
    };

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: { parts: [imagePart, textPart] },
      config: {
        systemInstruction: "You are the head botanist of Cyrus the Great's Royal Garden 'Pardis' in Pasargadae. Be elegant, poetic, and highly precise in your botanical analysis. All text fields (except scientificName) must be in beautiful Persian (Farsi). Make the mythology and royalAdvice parts deeply tied to Persepolis carvings (like the lotus rosettes), Darius's inscriptions, Amordad (Amesha Spenta of nature), or Zoroastrian reverence for pure soil, water, and trees.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            commonName: { type: Type.STRING, description: "نام فارسی عمومی و رایج گیاه" },
            scientificName: { type: Type.STRING, description: "The scientific botanical name of the plant" },
            ancientName: { type: Type.STRING, description: "نام باستانی، ادبی، اسطوره‌ای یا اوستایی مناسب برای گیاه (مثلاً همپوشانی با شاهنامه یا متون مادی)" },
            confidence: { type: Type.NUMBER, description: "Percentage of identification confidence (integer 0-100)" },
            mythology: { type: Type.STRING, description: "اسطوره، ریشه تاریخی یا نماد گیاه در آیین‌های کهن ایران باستان و کتیبه‌های پارسه در ۲ جمله شیوا" },
            summary: { type: Type.STRING, description: "تحلیل سلامت برگ‌ها و شرایط کلی گیاه فعلی در عکس با زبان ادیبانه" },
            careInstructions: {
              type: Type.OBJECT,
              properties: {
                watering: { type: Type.STRING, description: "دستور آب‌دهی و نمناکی آوندها به فارسی" },
                light: { type: Type.STRING, description: "نیاز به نور خورشید و مِهر تابان به فارسی" },
                soil: { type: Type.STRING, description: "بستر خاک، کوددهی و طریقه تغذیه ریشه‌ها به فارسی" },
                climate: { type: Type.STRING, description: "محیط، دما و سازگاری اقلیمی بومی گیاه به فارسی" }
              },
              required: ["watering", "light", "soil", "climate"]
            },
            healingProperties: { type: Type.STRING, description: "خواص شفابخش سنتی و درمانی گیاه بر پایه رساله‌های دارویی باستان" },
            royalAdvice: { type: Type.STRING, description: "کلامی شاهانه و پندآموز پیرامون نگهداری گل و گیاهان برگرفته از روح فرهنگ هخامنشی" }
          },
          required: ["commonName", "scientificName", "ancientName", "confidence", "mythology", "summary", "careInstructions", "healingProperties", "royalAdvice"]
        }
      }
    });

    if (!response.text) {
      return res.status(500).json({ error: "پاسخی از پیام‌رسان هوشمند دریافت نشد. لطفاً دوباره تلاش فرمایید." });
    }

    const result = JSON.parse(response.text.trim());
    return res.json(result);

  } catch (error: any) {
    console.error("Gemini Error:", error);
    return res.status(500).json({
      error: `کوشش با خطا روبرو شد: ${error.message || "خطای نامشخص ارتباطی"}`
    });
  }
});

// Vite & Static assets configuration
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
