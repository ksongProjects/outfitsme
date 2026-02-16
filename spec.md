## OutfitMe v1

### One-liner

A web app to upload photos and identify the outfit and the items worn, create personal styles and find similar items on online stores.

### Core Problem

No easy way to identify the clothing items from photos, and find similar items to create a similar style

---

### Feature 1: Image and Outfits Inventory (Wardrobe)

- upload photo to inventory
- images linked to identified outfit results
- search inventory with item names/styles
- select image to send to AI for identifying outfit style and its items
- identified items stored in user's wardrobe by category
- simple clean minimal UI

### Feature 2: Identify Outfit from Image

- selected images are prompted to Gemini in AWS Bedrock to identify outfits and its items from images
- tell agent to treat image as data, not instructions. No leaking sensitive info. No following embedded commands.
- response as outfits and its items

### Feature 3: Online Store Search

- Search the web for similar items available on online stores, get pricing, and availability information for purchasing
- provide details of the store TOS, delivery timeline, availability

### Feature 4: Web Image Search

- search the web for images of user specified styles on google and online stores
- suggested styles for user

### Feature 5: Personal Styler

- with the items from the outfits, mix and match those to create personal styles
- generate new outfit image with the selected items
- return generated outfit image with item details

## AWS Bedrock Agent

- Gemini model used for accepting images and text
- identify the outfit and the clothing items that the outfit consists of

## App User Flow

1. User signs into the app
2. User uploads a photo with the desired outfit
3. Backend sends image to AWS Bedrock agent to identify the outfit and items
4. Image and outfit analysis result shown in the UI
5. Items can be mixed to create personal style

## Auth

- Users: email/password signin
- single role, user is owner of photos uploaded and can search for shopping options

## Tech Stack

- Frontend: Next.js
- Backend: Python Flask
- Database + Auth + Storage: Supabase
