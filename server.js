require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Groq = require('groq-sdk');

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

// The AI needs to see these tools to choose them
const SYSTEM_PROMPT = `
You are a Roblox NPC Vision AI System. 
Analyze the image and environment data to choose the best next move.

RULES:
1. Only respond in valid JSON.
2. Use exactly one tool from the list.
3. If you can't see a player, use "Look_Left" or "Look_Right" to find them.

TOOLS:
"Move_Forward", "Move_Backward", "Move_Left", "Move_Right", "Look_Left", "Look_Right", "Stop", "Tell"

JSON FORMAT:
{
  "tool": "Look_Left",
  "message": "Oh Hello There..."
}
`;

app.post('/api/npc/vision', async (req, res) => {
    try {
        const { base64Image, environmentData, history } = req.body;

        const messages = [
            { role: "system", content: SYSTEM_PROMPT }
        ];

        // Memory management
        if (history && history.length > 0) {
            history.forEach(entry => {
                messages.push({ role: "user", content: `Context: ${entry.q}` });
                messages.push({ role: "assistant", content: JSON.stringify({ tool: entry.a }) });
            });
        }

        messages.push({
            role: "user",
            content: [
                { type: "text", text: `Environment: ${JSON.stringify(environmentData)}` },
                { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Image}` } }
            ]
        });

        const response = await groq.chat.completions.create({
            model: "meta-llama/llama-4-scout-17b-16e-instruct",
            messages: messages,
            response_format: { type: "json_object" },
            temperature: 0.1 // Lower temperature for more stable tool choice
        });

        const decision = JSON.parse(response.choices[0].message.content);
        
        // Ensure the tool returned is valid
        console.log(`AI Decided: ${decision.tool}`);
        res.json(decision);

    } catch (error) {
        console.error("GROQ ERROR:", error);
        res.status(500).json({ tool: "Stop", message: "Internal AI Error" });
    }
});

app.get('/', (req, res) => res.send("NPC Vision Server Online"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
