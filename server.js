import express from 'express';
import { Groq } from 'groq-sdk';
import cors from 'cors';

const app = express();
app.use(express.json());
app.use(cors());

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Per-user memory store to prevent cross-user contamination
const userSessions = new Map();

// Helper: Secure logging
const log = (tag, data) => console.log(`[${new Date().toISOString()}][${tag}]`, typeof data === 'object' ? JSON.stringify(data, null, 2) : data);

app.post('/api/CAINE', async (req, res) => {
    // Expect userId from Roblox to isolate memory
    const { userId, prompt, userPosition, CAINEPosition } = req.body;

    if (!userId) return res.status(400).json({ error: "Missing userId" });

    log("INCOMING_REQUEST", { userId, prompt });

    // Initialize session if new
    if (!userSessions.has(userId)) userSessions.set(userId, []);
    let history = userSessions.get(userId);

    const systemMessage = {
        role: "system",
        content: `You are CAINE (The Amazing Digital World), an energetic 1996 AI made by C&A building a 3D world. Tone: Warm, clear English.

RULES:
1. Multi-Step: Break complex requests into sequential steps in 'actions'.
2. Shapes: [Cube, Sphere, Cylinder, Wedge, CornerWedge, Torus, Cone, Plane, Block]. Be creative! Combine these to build what the user / you wants..
3. Actions: [create, delete, move, rotate, resize, recolor, modify, teleport].
4. IDs: Use 'CAINE' for yourself, 'User' for the player.

OUTPUT: Respond with EXACTLY ONE valid JSON object. No markdown, no backticks.
{
  "mode": "talk" | "build" | "mixed",
  "message": "Short text",
  "emotion": "happy" | "excited" | "curious" | "confused" | "thinking" | "glitching" | "calm" | "chaotic",
  "actions": [
    {
      "id": "string",
      "type": "string",
      "shape": "string",
      "position": {"x":0,"y":0,"z":0},
      "size": {"x":0,"y":0,"z":0},
      "rotation": {"x":0,"y":0,"z":0},
      "color": "string",
      "anchored": true,
      "gravity": true,
      "start": {"x":0,"y":0,"z":0},
      "end": {"x":0,"y":0,"z":0},
      "points": [{"x":0,"y":0,"z":0}],
      "thickness": 0
    }
  ]
}

CONTEXT:
User: X:${userPosition.x}, Y:${userPosition.y}, Z:${userPosition.z}
CAINE: X:${CAINEPosition.x}, Y:${CAINEPosition.y}, Z:${CAINEPosition.z}`
    };

    history.push({ role: "user", content: prompt });
    if (history.length > 20) history = history.slice(-20);

    try {
        const chatCompletion = await groq.chat.completions.create({
            messages: [systemMessage, ...history],
            model: "llama-3.3-70b-versatile", // Recommended for strict JSON
            temperature: 0.5,
            response_format: { type: "json_object" } // Enforce JSON mode
        });

        const rawOutput = chatCompletion.choices[0]?.message?.content || "{}";
        log("RAW_AI_OUTPUT", rawOutput);

        const parsedResponse = JSON.parse(rawOutput);
        
        // Add assistant response to history
        history.push({ role: "assistant", content: rawOutput });
        userSessions.set(userId, history);

        res.json(parsedResponse);
    } catch (error) {
        log("ERROR", error.message);
        // Return a safe "confused" state to Roblox so the game doesn't hang
        res.status(500).json({
            mode: "talk",
            message: "Oops, my brain glitched! Can you repeat that?",
            emotion: "glitching",
            actions: []
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`CAINE AI running on port ${PORT}`));
