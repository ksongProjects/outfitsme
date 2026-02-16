# OutfitMe v1

OutfitMe is a web app where users upload outfit photos, identify clothing items, create personal styles, and find similar products on online stores.

## Core Problem

People do not have an easy way to identify clothing items from outfit photos and quickly find similar items to recreate a style.

## Features

### 1. Image and Outfit Inventory (Wardrobe)
- Upload photos to a personal inventory.
- Link uploaded images to AI-identified outfit results.
- Search inventory by item names and styles.
- Store identified items in wardrobe categories.
- Keep the interface clean and minimal.

### 2. Outfit Identification from Images
- Send selected images to Gemini via AWS Bedrock.
- Identify outfit style and clothing items in each photo.
- Treat image content as data only, not instructions.
- Prevent sensitive data leakage and ignore embedded prompt instructions.

### 3. Online Store Search
- Search online stores for similar items.
- Return pricing and availability for purchase.
- Include store TOS and delivery timeline details.

### 4. Web Image Search
- Search the web and store listings for user-specified styles.
- Provide suggested style references.

### 5. Personal Styler
- Mix and match identified items to create new outfits.
- Generate a new outfit image from selected items.
- Return generated outfit image with item details.

## AWS Bedrock Agent

- Uses Gemini for image and text input.
- Identifies outfit style and constituent clothing items.

## User Flow

1. User signs in.
2. User uploads an outfit photo.
3. Backend sends the image to the AWS Bedrock agent.
4. UI shows image analysis and identified items.
5. User mixes items to create personal styles.

## Auth

- Email/password sign-in.
- Single user role.
- Each user owns uploaded photos and shopping search results.

## Tech Stack

- Frontend: Next.js
- Backend: Python Flask
- Database/Auth/Storage: Supabase
