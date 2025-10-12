# Riflett — The AI Personal Operating System

Modern journaling app with 3 types: Journal, Goal, Schedule. Dark theme UI with AI insights.

## Setup

### Prerequisites

- Node.js (v16+)
- npm or yarn
- Expo CLI: `npm install -g expo-cli`

### Install & Run

```bash
npm install
npm start
```
Then press:
- `i` for iOS simulator
- `a` for Android emulator

# Riflett

> “The real enemy isn’t pain — it’s disconnection.”

Reflectify is an **AI-powered Personal Operating System** designed to transform raw experience into structured growth.  
It merges journaling, goal-tracking, scheduling, and emotional reflection into one intelligent, chat-based interface —  
a space where your thoughts, decisions, and emotions evolve into coherence.

---

## 🌙 Core Idea

Reflectify isn’t another productivity app — it’s a **living mirror** that learns how you think.  
It helps you see patterns, contradictions, and cycles across your life, linking awareness to action.

Every entry, reflection, and decision is stored, analyzed, and explained —  
creating an ever-evolving map of who you are becoming.

---

## 🧠 System Overview

### 1. Main Chat — *“The Mind”*
Your core interface.  
It thinks, links, and evolves with you — turning reflections into structured intelligence.

**Use it for:**
- Adding new entries (`journal`, `goal`, `schedule`)
- Summarizing weeks into insights
- Turning reflections into rituals or rules
- Exploring contradictions and behavioral loops

**Example:**
Add entry: 10:42 PM | scrolling loop | restless | 25m | 3/10 | anchor:no
Summarize last 7 entries → 2 patterns + 1 contradiction
If drift after 10:30 PM → trigger 2-step anchor rule

---

### 2. Memory System — *“The Brain”*
All entries are stored in a structured Supabase database.  
Each record includes:
- Type (`journal`, `goal`, `schedule`)
- Timestamps
- Metadata (AI insights, triggers, outcomes)
- Audit log explaining *why* AI responded the way it did

This creates transparency, ethical traceability, and data-driven reflection.

---

### 3. Pattern Engine — *“The Mirror”*
Detects patterns, behaviors, and emotional cycles using AI and timestamp analytics.

**Capabilities:**
- Surface top recurring forces (“vision gravity vs. execution drift”)
- Score alignment between intention and behavior
- Generate weekly story summaries and contradictions
- Suggest micro-rituals or boundaries based on historical context

---

### 4. Schedule System — *“The Compass”*
Bridges awareness with execution.

**Features:**
- `Schedule` button auto-fills `Place | Time | Reason`
- Calendar view for weekly and monthly itineraries
- Entry linking between schedule and reflective moments
- Time-based triggers for pattern interruptions

---

### 5. AI Ethics Layer — *“The Conscience”*
Every AI insight logs:
1. **Reasoning chain:** how the AI formed its conclusion.  
2. **What it learned about you:** captured in plain English.  

This makes Reflectify a **transparent intelligence**, accountable for its reflections — not a black box.

---

## 🏗️ Tech Stack

| Layer | Stack |
|-------|-------|
| **Frontend** | React Native (Expo, TypeScript) |
| **Backend** | Supabase (PostgreSQL + SQLModel) |
| **AI Engine** | OpenAI API (Contextual + Reflective Intelligence) |
| **State Mgmt** | Context API + Async Storage |
| **Authentication** | Supabase Auth |
| **UI/UX** | Minimal, chat-first, mobile-responsive |
| **Focus** | Private, local-first data philosophy |

---

## 🌍 Philosophy

Reflectify stands on three principles:

1. **Clarity over comfort** — It won’t just make you feel better; it helps you *see* better.  
2. **Reflection as intelligence** — Every thought becomes part of a living system that learns with you.  
3. **Transparency as trust** — Every AI action is logged, explained, and accountable.

---

## 🧩 Example Prompts

"Add entry: morning fatigue | 6/10 | slept 4 hours | drift trigger"
"Summarize last 5 reflections into one growth insight."
"Link yesterday’s reflection to new anchor ritual."
"Show week summary → 2 forces + 1 contradiction."

yaml
Copy code

---

## 🔒 Privacy & Data

Reflectify is built with a **local-first** design philosophy:
- Your data belongs to you.
- All insights are generated on your context.
- Every AI action is auditable.

---

## 🧭 Vision Roadmap

| Phase | Focus |
|-------|-------|
| **Alpha (Now)** | Core chat, entry creation, AI reflection, Supabase sync |
| **Beta** | Pattern Engine + Calendar UI + Summaries |
| **v1.0 Launch** | Full Emotional OS — adaptive rituals, daily summaries, ethical transparency |
| **Long-Term** | Collective Reflection Network (anonymous global insight sharing) |

---

## ✨ Purpose

Reflectify isn’t here to optimize your day.  
It’s here to unify your inner world —  
so your patterns, pain, and progress finally make sense together.

> *“When reflection becomes intelligence, awareness becomes power.”*

---

**Built with clarity. Guided by conscience. Alive with purpose.**  
© 2025 Riflett — All Rights Reserved.