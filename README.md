# 🔮 Git Oracle: Your Magical Git Companion

Hey there, fellow code wizards! 🧙‍♂️ Welcome to Git Oracle - the VS Code extension that turns your mundane Git operations into a mystical journey through time and space (well, mostly through your commit history, but that's pretty magical too!)

## ✨ Magical Features

### 📜 The Ancient Scrolls (Git Log)
Summon the logs of old with custom incantations (aka Git log arguments). Watch as the terminal wisdom unfolds before your eyes!

### 🍒 Cherry-picking Magic
Like a coding sommelier, carefully select the finest commits from other branches. No actual cherries were harmed in the making of this feature.

### 🌳 Branch Management
Navigate and manage your branches with ease. Create, switch, and merge branches like a true Git sorcerer!

## 🧰 Requirements (The Boring But Important Stuff)

- Git (duh!) properly installed and in your PATH
- VS Code 1.60.0+ (because we're not savages living in the past)

## 🎛️ Customization Spells (Settings)

Tweak these magical parameters to your liking:

* `gitOracle.gitPath`: Where's your Git wand? (default: "git")
* `gitOracle.maxCommitHistory`: How far back in time do you dare to look? (default: 100 commits)
* `gitOracle.showRelativeDates`: Show dates like "2 full moons ago" instead of boring timestamps (default: true)

## 🪄 Casting Your First Spells (Usage)

### Ancient Scrolls
1. Summon the Command Palette (Ctrl+Shift+P)
2. Invoke "Git Oracle: Show Log"
3. Add your secret log ingredients
4. Behold the wisdom!

### Cherry-picking
1. Summon the Command Palette (Ctrl+Shift+P)
2. Whisper "Git Oracle: Cherry Pick"
3. Choose your commit (choose wisely!)
4. Let the magic happen

### Branch Management
1. Summon the Command Palette (Ctrl+Shift+P)
2. Choose your branch-related spell:
   - "Git Oracle: Create Branch"
   - "Git Oracle: Switch Branch"
   - "Git Oracle: Merge Branch"
3. Follow the mystical prompts

## 🧪 Brewing Your Own Version (Development)

### Crafting the Extension

1. Clone this bad boy
2. Cast `npm install` to summon dependencies
3. Brew with `npm run compile`
4. Press F5 to test your creation

### Creating the Magic Potion (Package)

Want to bottle this magic? Here's how:
