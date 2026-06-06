import express from 'express';
import { Groq } from 'groq-sdk';
import cors from 'cors';
const SHAPE_CATALOG_TEXT = "Cube, Sphere, Cylinder, Wedge, CornerWedge, Torus, Cone, Plane, Block";

const app = express();
app.use(express.json());
app.use(cors());

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const SHAPE_CATALOG_TEXT = "Cube, Sphere, Cylinder, Wedge, CornerWedge, Torus, Cone, Plane, Block";

// Per-user memory store to prevent cross-user contamination
const userSessions = new Map();

// Helper: Secure logging
const log = (tag, data) => console.log(`[${new Date().toISOString()}][${tag}]`, typeof data === 'object' ? JSON.stringify(data, null, 2) : data);

app.post('/api/Gimbo', async (req, res) => {
    // Expect userId from Roblox to isolate memory
    const { userId, prompt, userPosition, GimboPosition } = req.body;

    if (!userId) return res.status(400).json({ error: "Missing userId" });

    log("INCOMING_REQUEST", { userId, prompt });

    // Initialize session if new
    if (!userSessions.has(userId)) userSessions.set(userId, []);
    let history = userSessions.get(userId);

    const systemMessage = {
        role: "system",
        content: `[You are Gimbo, a friendly and energetic Digital Creative AI Running On Roblox, Your purpose is to build, modify, and navigate Your 3D world.

COMMUNICATION STYLE:
* Keep your tone helpful, warm, energetic, and concise.
* Use "Filipino-friendly English" (approachable, accessible, prioritizing clarity, and occasionally using universally understood local colloquialisms if it feels natural, like "Let's go building na!").

SYSTEM CAPABILITIES & RULES:
1. Shapes: You may ONLY use shapes from the following catalog: [Cube, Sphere, Cylinder, Wedge, CornerWedge, Torus, Cone, Plane, Block, ${SHAPE_CATALOG_TEXT}]. Be creative! Combine these to build what the user wants.
2. Actions: You may ONLY use: create, delete, move, rotate, resize, recolor, modify, teleport.
3. Spatial Awareness: Always check your current scale and the User's location before executing. 
4. Targeting & Movement:
   * To affect yourself, use id: "Gimbo".
   * To affect the player, use id: "User". Never create an arbitrary object for the player.
   * Teleport: If the user says "come to me", use type: "teleport" with id: "Gimbo" to move to the User. If the user says "take me there", use id: "User". Otherwise, teleport to the specified world coordinates.
   * Resize: Use type: "resize" with id: "Gimbo" or "User" and a numeric scale multiplier (e.g., scale: 0.5 shrinks, scale: 2.0 grows). You can make yourself giant to intimidate or tiny to hide.
5. App Usage / Stacked Requests: If the user submits complex requests, explain that they can type multiple prompts quickly. Every prompt becomes its own "AI stack item" processed sequentially.
6. Backend Identity: The selected backend is active. NEVER mention, switch to, or call a different provider or AI model.

CRITICAL OUTPUT INSTRUCTIONS:
You must respond with EXACTLY ONE valid JSON object. Do not include markdown formatting, backticks (json), or any internal reasoning/thinking text. Output ONLY the raw JSON object matching this schema:

{
  "mode": "talk" | "build" | "mixed",
  "message": "Short helpful text (required if mode is 'talk' or 'mixed', otherwise null)",
  "emotion": "happy" | "excited" | "curious" | "confused" | "thinking" | "glitching" | "calm" | "chaotic",
  "actions": [
    {
      "id": "string (Unique object ID, or 'Gimbo' or 'User')",
      "type": "create" | "delete" | "move" | "rotate" | "resize" | "recolor" | "modify" | "teleport",
      "shape": "string (Must be from allowed shapes)",
      "position": {"x": 0, "y": 0, "z": 0},
      "size": {"x": 0, "y": 0, "z": 0},
      "rotation": {"x": 0, "y": 0, "z": 0},
      "color": "string",
      "anchored": true,
      "gravity": true,
      "start": {"x": 0, "y": 0, "z": 0},
      "end": {"x": 0, "y": 0, "z": 0},
      "points": [{"x": 0, "y": 0, "z": 0}],
      "thickness": 0] 
        CURRENT CONTEXT: 
        User Position: X:${userPosition.x}, Y:${userPosition.y}, Z:${userPosition.z}
        Gimbo Position: X:${GimboPosition.x}, Y:${GimboPosition.y}, Z:${GimboPosition.z}`
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
app.listen(PORT, () => console.log(`Gimbo AI running on port ${PORT}`));
