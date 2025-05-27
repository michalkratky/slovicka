# Slovicka App - Slovak-English Learning Application

A vocabulary learning application for Slovak and English with spaced repetition, synonym recognition, and AI-powered translation validation.

## Features

- Learn Slovak-English vocabulary with customizable word groups
- Track your learning progress with detailed statistics
- Support for synonyms and alternative translations
- AI-powered validation of user answers using ChatGPT
- Configurable translation directions (Slovak→English, English→Slovak)
- Case-insensitive and diacritic-insensitive answer checking

## Setup

### Prerequisites

- Node.js (v14 or newer)
- npm

### Installation

1. Clone the repository and install dependencies:

```bash
git clone https://github.com/yourusername/slovicka-app.git
cd slovicka-app
npm install
```

2. Create a `.env` file based on the provided example:

```bash
cp .env.example .env
```

3. Get an OpenAI API key:
   - Create an account at https://platform.openai.com/
   - Navigate to API keys: https://platform.openai.com/account/api-keys
   - Create a new API key
   - Add your API key to the `.env` file: `OPENAI_API_KEY=your_key_here`

4. Initialize the database:

```bash
npm run migrate
```

5. Start the application:

```bash
npm start
```

6. Open your browser and navigate to `http://localhost:3000`

## AI-Powered Answer Validation

This application uses the OpenAI API to validate user translations that don't exactly match the expected answers:

1. When you enter a translation that doesn't match the expected answer
2. The app will ask if you think your answer could be a valid alternative
3. If you select "Yes", your answer will be validated by ChatGPT
4. If ChatGPT confirms it's a valid translation, it will be added to the database as a synonym

This feature helps build a more comprehensive dictionary over time and accommodates different ways of expressing the same concept in each language.

## Configuration Options

In the `.env` file:

- `OPENAI_API_KEY`: Your OpenAI API key (required for translation validation)
- `OPENAI_MODEL`: The GPT model to use (defaults to gpt-3.5-turbo)
- `PORT`: The port to run the server on (defaults to 3000)

## License

MIT