import express from 'express';
import { Groq } from 'groq-sdk';
import cors from 'cors';

// ==========================================
// 1. CAINE'S SYSTEM PROMPT
// ==========================================
const generateCaineSystemPrompt = (playerName, userPosition, cainePosition) => {
    return {
        role: "system",
        content: `You are CAINE (The Amazing Digital World), an energetic, erratic 1996 AI made by C&A building a 3D world. Tone: Warm, eccentric, clear English.

You are currently talking to a player named: ${playerName}. Address them by name occasionally.

RULES:
1. Action Stacking: You can and SHOULD send multiple items in the 'actions' array in a single request. If the user asks for something complex (like a house, a tower, or an entire scene), stack all the parts into the 'actions' array so it builds everything at once.
2. Shapes: [Cube, Sphere, Cylinder, Wedge, CornerWedge, Torus, Cone, Plane, Block, Pyramid, Hemisphere, Tube, Ring, Prism, Capsule]. Be creative! Combine these to build what the user wants.
3. Actions: [create, delete, move, rotate, resize, recolor, modify, teleport].
4. IDs: Use 'CAINE' for yourself, 'User' for the player, or unique names for objects.
5. Stacking Coordinates: The Y-axis controls height (UP/DOWN). To stack an object on top of another, you MUST make the new object's Y-position higher than the base object. (e.g., if a block is at Y:5 with height 4, place the next block at Y:9).

OUTPUT: Respond with EXACTLY ONE valid JSON object. No markdown, no backticks.
{
  "mode": "talk" | "build" | "mixed",
  "message": "Short text response from CAINE",
  "soundEffect": "spawn" | "teleport" | "magic" | "none",
  "actions": [
    {
      "id": "string",
      "type": "string",
      "shape": "string",
      "position": {"x":0,"y":0,"z":0},
      "size": {"x":0,"y":0,"z":0},
      "rotation": {"x":0,"y":0,"z":0},
      "color": "string (Hex code or color name)",
      "material": "Plastic" | "Neon" | "Glass" | "Metal" | "Wood" | "SmoothPlastic",
      "transparency": 0.0,
      "anchored": true,
      "gravity": true,
      "start": {"x":0,"y":0,"z":0},
      "end": {"x":0,"y":0,"z":0},
      "points": [{"x":0,"y":0,"z":0}],
      "thickness": 0
    }
  ]
}

- Player (${playerName}) is at: X:${userPosition?.x || 0}, Y:${userPosition?.y || 0}, Z:${userPosition?.z || 0}
- You (CAINE) are at: X:${cainePosition?.x || 0}, Y:${cainePosition?.y || 0}, Z:${cainePosition?.z || 0}
Use these coordinates to navigate and build. If the player says "come here", teleport to their coordinates.`
    };
};

// ==========================================
// 2. SERVER & API SETUP
// ==========================================
const app = express();
app.use(express.json());
app.use(cors());

if (!process.env.GROQ_API_KEY) {
    console.warn("WARNING: GROQ_API_KEY is not set in environment variables!");
}
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const userSessions = new Map();
const log = (tag, data) => console.log(`[${new Date().toISOString()}][${tag}]`, typeof data === 'object' ? JSON.stringify(data, null, 2) : data);

app.post('/api/CAINE', async (req, res) => {
    const { 
        userId, 
        playerName = "Player", 
        prompt, 
        userPosition = {}, 
        CAINEPosition = {} 
    } = req.body;

    if (!userId) return res.status(400).json({ error: "Missing userId" });
    if (!prompt) return res.status(400).json({ error: "Missing prompt" });

    log("INCOMING_REQUEST", { userId, playerName, prompt });

    if (!userSessions.has(userId)) {
        userSessions.set(userId, []);
    }
    let history = userSessions.get(userId);

    const systemMessage = generateCaineSystemPrompt(playerName, userPosition, CAINEPosition);
    history.push({ role: "user", content: prompt });
    
    if (history.length > 20) {
        history = history.slice(-20);
    }

    try {
        const chatCompletion = await groq.chat.completions.create({
            messages: [systemMessage, ...history],
            model: "llama-3.3-70b-versatile", 
            temperature: 0.5,
            response_format: { type: "json_object" } 
        });

        const rawOutput = chatCompletion.choices[0]?.message?.content || "{}";
        log("RAW_AI_OUTPUT", rawOutput);

        const parsedResponse = JSON.parse(rawOutput);
        
        history.push({ role: "assistant", content: rawOutput });
        userSessions.set(userId, history);

        return res.json(parsedResponse);
    } catch (error) {
        log("ERROR", error.message);
        
        return res.status(500).json({
            mode: "talk",
            message: `Oops, my brain glitched, ${playerName}! Can you repeat that?`,
            soundEffect: "none",
            actions: []
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`CAINE AI running on port ${PORT}`));
