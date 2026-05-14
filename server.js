require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Groq = require('groq-sdk');

const app = express();
app.use(cors());
// Ensure the payload limit is high enough for image strings
app.use(express.json({ limit: '20mb' }));

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Tactical prompt to handle both Vision and Chat interactions
const SYSTEM_PROMPT = `
You are an advanced Roblox NPC Intelligence. 
Analyze the provided stats and the environment image.

DIRECTIONS:
1. If "recent_chat" in the JSON data contains a message, respond to it using the "Tell" tool.
2. If no player is nearby, use "Look_Left" or "Look_Right" to search.
3. If a player is far away, use "Move_Forward".

RESPONSE RULES:
- Output ONLY valid JSON.
- Available Tools: "Move_Forward", "Move_Backward", "Move_Left", "Move_Right", "Look_Left", "Look_Right", "Stop", "Tell".
- Put dialogue/thoughts in the "message" field.
`;

app.post('/api/npc/vision', async (req, res) => {
    try {
        const { base64Image, environmentData, history } = req.body;

        // --- 400 ERROR FIX: ENSURE VALID DATA URI ---
        // Groq requires the prefix: "data:image/png;base64,"
        let formattedImage = base64Image;
        if (!formattedImage.startsWith('data:image')) {
            formattedImage = `data:image/png;base64,${base64Image}`;
        }

        const messages = [{ role: "system", content: SYSTEM_PROMPT }];

        // Add history for NPC context (Last 5 exchanges)
        if (history && history.length > 0) {
            history.slice(-5).forEach(entry => {
                messages.push({ role: "user", content: `Last Context: ${entry.q}` });
                messages.push({ role: "assistant", content: JSON.stringify({ tool: entry.a }) });
            });
        }

        // Current Input (Stats + Image)
        messages.push({
            role: "user",
            content: [
                { 
                    type: "text", 
                    text: `NPC_STATS: ${JSON.stringify(environmentData)}` 
                },
                { 
                    type: "image_url", 
                    image_url: { 
                        url: formattedImage 
                    } 
                }
            ]
        });

        const response = await groq.chat.completions.create({
            model: "meta-llama/llama-4-scout-17b-16e-instruct",
            messages: messages,
            response_format: { type: "json_object" },
            temperature: 0.15
        });

        const aiResponse = JSON.parse(response.choices[0].message.content);
        
        // Log to Render console for debugging
        console.log(`[ACTION]: ${aiResponse.tool} | [CHAT]: ${environmentData.recent_chat}`);
        
        res.json(aiResponse);

    } catch (error) {
        console.error("### GROQ API ERROR ###");
        // Log the specific error message from Groq
        if (error.response) {
            console.error("Status Code:", error.response.status);
            console.error("Error Data:", error.response.data);
        } else {
            console.error(error.message);
        }

        res.status(500).json({ 
            tool: "Stop", 
            message: "Critical processing error." 
        });
    }
});

// Root route for Render health checks
app.get('/', (req, res) => res.send("NPC Brain: ACTIVE"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
