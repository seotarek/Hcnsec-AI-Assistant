# Hcnsec AI Assistant 🤖

[![VS Code Marketplace Version](https://img.shields.io/vscode-marketplace/v/HcnsecAIAssistant.hcnsec-assistant.svg?style=for-the-badge&logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=HcnsecAIAssistant.hcnsec-assistant)
[![VS Code Marketplace Installs](https://img.shields.io/vscode-marketplace/d/HcnsecAIAssistant.hcnsec-assistant.svg?style=for-the-badge)](https://marketplace.visualstudio.com/items?itemName=HcnsecAIAssistant.hcnsec-assistant)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](LICENSE)

A professional, feature-packed AI coding assistant extension for Visual Studio Code, powered by the Hcnsec API (新疆幻城网安科技公益大模型).

[**📦 View on VS Code Marketplace**](https://marketplace.visualstudio.com/items?itemName=HcnsecAIAssistant.hcnsec-assistant)

---

## 🌟 Key Features / المميزات الرئيسية

- 💬 **Copilot-Style Sidebar Chat:** Sleek, modern chat interface matching VS Code design aesthetics.
- 🌍 **Trilingual Support (AR / EN / ZH):** Full UI translation in **Arabic (مع دعم كامل لاتجاه RTL)**, **English**, and **Chinese** (简体中文).
- 🧠 **Agentic Mode (Planner & Executor):** Delegate complex multi-step coding tasks using separate Planner and Executor models.
- 📁 **Project & Code Context Awareness:** Instantly send full file contents, selection, folder structures, or automated project summaries to the AI with one click.
- 🤖 **Multi-Model Support:** Choose from top-tier models including DeepSeek-V4, Qwen3.5, GLM-4.7, Kimi-K2.6, MiniMax, Step, and auto-routing.
- 🔑 **Bring Your Own Key (BYOK):** Secure API key & custom endpoint configuration.
- ⚡ **Code Block Utilities:** One-click code copying and syntax formatting.

---

## 🚀 Installation / التثبيت

### Method 1: Directly from VS Code (Recommended)
1. Open **VS Code**.
2. Go to the **Extensions** view (`Ctrl+Shift+X` or `Cmd+Shift+X`).
3. Search for **`Hcnsec AI Assistant`** or **`HcnsecAIAssistant.hcnsec-assistant`**.
4. Click **Install**.

### Method 2: Via VS Code Terminal (CLI)
Run the following command in your terminal:
```bash
code --install-extension HcnsecAIAssistant.hcnsec-assistant
```

### Method 3: Manual VSIX Package
1. Download the latest `.vsix` from the [Releases](https://github.com/seotarek/Hcnsec-AI-Assistant/releases) or builds.
2. In VS Code Extensions tab, click `...` -> **Install from VSIX...**

---

## ⚙️ Configuration / الإعدادات

1. Click on the **Hcnsec AI** icon (🤖) on the Activity Bar.
2. Switch to the **⚙️ Settings** tab.
3. Enter your **Hcnsec API Key** (`sk-...`).
4. Select your preferred **Chat Model** and **Language** (English 🇬🇧 / العربية 🇸🇦 / 中文 🇨🇳).
5. (Optional) Enable **Agentic Mode** and select your preferred Planner & Executor models.
6. Click **Save**.

---

## 📖 Usage / الاستخدام

- **Chatting:** Ask coding questions, debug errors, or generate boilerplate directly in the 💬 Chat tab.
- **Context Bar:** Click 📄 *Current File*, 📁 *Project Structure*, 🔍 *Selected Code*, or 📋 *Project Summary* to attach rich context to your message.
- **Editor Context Menu:** Select code in any editor file, right-click, and choose **Hcnsec AI: Ask About This Code**.

---

## 📜 License

Distributed under the [MIT License](LICENSE).
