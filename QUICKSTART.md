# QuestMind - Quick Start Guide

## 🚀 Get Up and Running in 5 Minutes

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Get Your Free API Key
1. Visit [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Click "Create API Key"
3. Copy the generated key

### Step 3: Configure Your API Key
Edit `src/environments/environment.ts`:

```typescript
export const environment = {
  production: false,
  googleAiApiKey: 'PASTE_YOUR_API_KEY_HERE'  // 👈 Replace this
};
```

### Step 4: Start the Dev Server
```bash
npm start
```

### Step 5: Open Your Browser
Navigate to: **http://localhost:4200**

## 💬 Try These Example Prompts

### Character Creation
- "I want to create a wizard character"
- "Help me build a half-elf ranger"
- "Create a paladin with the Acolyte background"

### Rules Questions
- "How does spellcasting work for wizards?"
- "What are the differences between a warlock and a sorcerer?"
- "Explain ability score improvements"

### Tasha's & Xanathar's
- "What are the Custom Origin rules from Tasha's?"
- "Tell me about the Bladesinger wizard subclass"
- "What spells did Tasha's Cauldron add?"

## 🎯 What You Can Do

✅ Natural language character creation
✅ D&D 5e rules clarification  
✅ Spell and equipment suggestions
✅ Race and class recommendations
✅ Rules from PHB, Tasha's, and Xanathar's

## 🆘 Troubleshooting

### "API key invalid or missing"
- Check that you replaced `YOUR_GOOGLE_AI_API_KEY_HERE` in `environment.ts`
- Verify your API key is correct (no extra spaces)
- Ensure you saved the file

### "Network error"
- Check your internet connection
- Verify the dev server is running
- Try refreshing the page

### "Rate limit exceeded"
- Wait a few minutes before trying again
- Google's free tier has generous limits
- Consider creating a new API key if needed

## 📚 Learn More

- Full documentation: See `README.md`
- Implementation details: See `.docs/IMPLEMENTATION.md`
- Original spec: See `.docs/tickets/01-ai-powered-chat-interface.md`

## 🎨 Features Highlights

- **Modern UI**: Beautiful gradient design with smooth animations
- **Smart Context**: AI remembers your conversation
- **Loading States**: Visual feedback while AI thinks
- **Error Handling**: Friendly error messages
- **Keyboard Shortcuts**: Press Enter to send

## 🔮 Coming Soon

- Character sheet form builder
- PDF export functionality
- Save characters to database
- User accounts and authentication

---

**Have fun creating characters! 🎲✨**
