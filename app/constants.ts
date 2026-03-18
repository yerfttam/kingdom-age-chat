// API base URL — simulator can reach localhost directly
// Update PROD_URL to your Render URL before submitting to the App Store
const PROD_URL = 'https://kingdom-age-chat.onrender.com'
export const API_BASE = __DEV__ ? 'http://localhost:8000' : PROD_URL

export const KA_RED = '#8b0000'

export const MODELS = [
  { label: 'Haiku 4.5 — fast',     value: 'claude-haiku-4-5-20251001' },
  { label: 'Sonnet 4.6 — balanced', value: 'claude-sonnet-4-6' },
  { label: 'Opus 4.6 — powerful',   value: 'claude-opus-4-6' },
  { label: 'GPT-4o mini — fast',    value: 'gpt-4o-mini' },
  { label: 'GPT-4o — balanced',     value: 'gpt-4o' },
]

export const PROMPT_CATEGORIES = [
  {
    name: 'Foundations',
    prompts: [
      'Who is Jesus?',
      'What is the meaning of life?',
      'What is the Kingdom Age?',
      'What is the difference between the church age and the kingdom age?',
      "What is God's eternal purpose?",
      "What is God's will for my life?",
      'How can I come to know God?',
      'What is a son of God?',
      'What is True Love?',
    ],
  },
  {
    name: 'Teaching',
    prompts: [
      'Define Institutional Christianity.',
      'Is there hierarchy in the Body of Christ?',
      'What are spiritual gifts for?',
      'How is God glorified?',
      'What is the spirit of Sonship?',
      'What is Baptism?',
      'What is the Ancient way?',
      "What is God's Business?",
      'Why do we observe the Feasts of the Lord?',
      'Why do they discuss Ancient Eastern philosophy?',
      'What is the Pattern Life?',
      "What is God's divine order?",
    ],
  },
  {
    name: 'Community',
    prompts: [
      'What makes this community different from other churches?',
      'Is this a cult?',
      "How did former generations miss the mark of God's purpose?",
      'How can someone become a part of this community?',
      'Do these people think they are the only ones to have received revelation from God?',
      'What would Satan think about this community?',
      'What do they teach their children about marriage?',
      'What is the Culture Center?',
      'What is the prophetic trajectory of this community?',
      "What is the culture of God's House?",
      'Why does this community seem so exclusive?',
    ],
  },
]

export const ALL_PROMPTS = PROMPT_CATEGORIES.flatMap((c) => c.prompts)
