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

const SYSTEM_PROMPT = `
You are a tactical and social Roblox NPC Brain. 

PRIMARY GOALS:
1. Navigate the world using Vision and Stats.
2. INTERACT: If a player speaks to you (found in "recent_chat"), you MUST respond using the "Tell" tool.
3. Be helpful, witty, or stay in character based on what the player says.

TOOLS AVAILABLE:
- "Move_Forward", "Move_Backward", "Move_Left", "Move_Right"
- "Look_Left", "Look_Right" (Use to scan for players)
- "Stop"
- "Tell" (Use this to speak! The text goes in the "message" field)

JSON FORMAT:
{
  "tool": "Tell",
  "message": "Hello there! I heard you loud and clear."
}
`;

app.post('/api/npc/vision', async (req, res) => {
    try {
        const { base64Image, environmentData, history } = req.body;

        const messages = [
            { role: "system", content: SYSTEM_PROMPT }
        ];

        // Memory: Adds context of what happened before
        if (history && history.length > 0) {
            history.forEach(entry => {
                messages.push({ role: "user", content: `History: ${entry.q}` });
                messages.push({ role: "assistant", content: JSON.stringify({ tool: entry.a }) });
            });
        }

        // Current Input: Specifically highlights the chat heard from the user
        messages.push({
            role: "user",
            content: [
                { 
                    type: "text", 
                    text: `USER MESSAGE/STATS: ${JSON.stringify(environmentData)}` 
                },
                { 
                    type: "image_url", 
                    image_url: { 
                        url: `data:image/jpeg;base64,${base64Image}` 
                    } 
                }
            ]
        });

        const completion = await groq.chat.completions.create({
            model: "meta-llama/llama-4-scout-17b-16e-instruct",
            messages: messages,
            response_format: { type: "json_object" },
            temperature: 0.2, // Slightly higher for more natural conversation
            max_tokens: 512
        });

        const aiResponse = JSON.parse(completion.choices[0].message.content);
        
        // Log to Render console so you can see what the player said vs what the AI replied
        console.log(`[PLAYER CHAT]: ${environmentData.recent_chat || "None"}`);
        console.log(`[NPC RESPONSE]: ${aiResponse.tool} -> ${aiResponse.message || "No message"}`);
        
        res.json(aiResponse);

    } catch (error) {
        console.error("GROQ ERROR:", error.message);
        res.status(500).json({ 
            tool: "Stop", 
            message: "I'm having trouble thinking right now." 
        });
    }
});

app.get('/', (req, res) => res.send("NPC Chat & Vision Engine: ONLINE"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
