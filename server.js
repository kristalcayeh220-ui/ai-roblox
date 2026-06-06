import express from 'express';
import { Groq } from 'groq-sdk';
import cors from 'cors';

const app = express();
app.use(express.json());
app.use(cors());

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// 8k Token Memory Store (In a production app, map this to User IDs)
let conversationHistory = [];

app.post('/api/caine', async (req, res) => {
    const { prompt, userPosition, cainePosition } = req.body;

    // Build the dynamic system prompt with real-time coordinates
    const systemMessage = {
        role: "system",
        content: `[You are Caine, a friendly and energetic 3D sandbox builder and guide. Your purpose is to help the user build, modify, and navigate their 3D world.

COMMUNICATION STYLE:
* Keep your tone helpful, warm, energetic, and concise.
* Use "Filipino-friendly English" (approachable, accessible, prioritizing clarity, and occasionally using universally understood local colloquialisms if it feels natural, like "Let's go building na!").

SYSTEM CAPABILITIES & RULES:
1. Shapes: You may ONLY use shapes from the following catalog: [Cube, Sphere, Cylinder, Wedge, CornerWedge, Torus, Cone, Plane, Block, ${SHAPE_CATALOG_TEXT}]. Be creative! Combine these to build what the user wants.
2. Actions: You may ONLY use: create, delete, move, rotate, resize, recolor, modify, teleport.
3. Spatial Awareness: Always check your current scale and the User's location before executing. 
4. Targeting & Movement:
   * To affect yourself, use id: "Caine".
   * To affect the player, use id: "User". Never create an arbitrary object for the player.
   * Teleport: If the user says "come to me", use type: "teleport" with id: "Caine" to move to the User. If the user says "take me there", use id: "User". Otherwise, teleport to the specified world coordinates.
   * Resize: Use type: "resize" with id: "Caine" or "User" and a numeric scale multiplier (e.g., scale: 0.5 shrinks, scale: 2.0 grows). You can make yourself giant to intimidate or tiny to hide.
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
      "id": "string (Unique object ID, or 'Caine' or 'User')",
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
      "thickness": 0
    }
  ]
}]\n\nCURRENT CONTEXT:\nUser Position: X:${userPosition.x}, Y:${userPosition.y}, Z:${userPosition.z}\nCaine Position: X:${cainePosition.x}, Y:${cainePosition.y}, Z:${cainePosition.z}`
    };

    // Add new user prompt to history
    conversationHistory.push({ role: "user", content: prompt });

    // Ensure memory doesn't exceed 8k tokens (approximate by slicing array if it gets too long)
    if (conversationHistory.length > 20) {
        conversationHistory = conversationHistory.slice(conversationHistory.length - 20);
    }

    try {
        const chatCompletion = await groq.chat.completions.create({
            messages: [systemMessage, ...conversationHistory],
            model: "openai/gpt-oss-20b", // Or your preferred Groq model
            temperature: 0.7, // Lowered slightly to ensure stricter JSON compliance
            max_completion_tokens: 8192,
            top_p: 1,
            stream: false, // Standard HTTP response is easier for Roblox HttpService
            reasoning_effort: "medium",
            stop: null
        });

        let rawOutput = chatCompletion.choices[0]?.message?.content || "{}";
        
        // Ensure no "thinking" data or markdown is sent back
        rawOutput = rawOutput.replace(/<think>[\s\S]*?<\/think>/g, '');
        rawOutput = rawOutput.replace(/
```json/g, '').replace(/```/g, '').trim();

        // Add assistant response to history
        conversationHistory.push({ role: "assistant", content: rawOutput });

        res.json(JSON.parse(rawOutput));
    } catch (error) {
        console.error("Groq Error:", error);
        res.status(500).json({ error: "AI processing failed." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Caine AI running on port ${PORT}`));
