# Light & Shadow Media - Website

A cinematic, dark-themed website for a premium video production company. Built with pure HTML, CSS, and JavaScript for easy deployment on GitHub Pages or any static hosting.

## 🎬 Project Structure

```
light-and-shadow-media/
├── index.html              # Home page (Hero, About, Services, Featured Work, Contact)
├── live-events.html        # Live Events showcase
├── corporate.html          # Corporate videos showcase
├── film.html               # Film projects showcase
│
├── css/
│   └── styles.css          # All styles with CSS custom properties
│
├── js/
│   └── main.js             # Navigation, animations, modal, dynamic content loading
│
├── assets/
│   ├── images/
│   │   ├── hero/           # Hero section backgrounds
│   │   ├── about/          # Team photos, studio shots
│   │   ├── logos/          # Company logo, favicon
│   │   ├── events/         # Live event thumbnails
│   │   ├── corporate/      # Corporate project thumbnails
│   │   └── films/          # Film project thumbnails
│   │
│   └── videos/             # Background videos or clips
│
├── data/                   # JSON files for content management
│   ├── live-events.json    # Live events data
│   ├── corporate.json      # Corporate project entries
│   └── films.json          # Film project entries
│
└── README.md               # This file
```

## 🎨 Design Features

- **Dark Cinematic Theme**: Charcoal backgrounds with dramatic lighting effects
- **Gold Accents**: Elegant gold (#c9a227) highlights for premium feel
- **Typography**: Cinzel (display) + Raleway (body) font pairing
- **Animations**: Fade-in on scroll, stagger effects, smooth transitions
- **Film Grain Overlay**: Subtle texture for cinematic atmosphere
- **Responsive Design**: Mobile-first approach, works on all devices

## 🛠 How to Update Content

### Adding a New Project

1. Open the relevant JSON file in the `data/` folder:
   - `live-events.json` for events
   - `corporate.json` for corporate videos
   - `films.json` for film projects

2. Add a new entry following this format:

```json
{
  "id": "unique-id",
  "title": "Project Title",
  "year": 2024,
  "client": "Client Name",
  "description": "Brief description of the project...",
  "thumbnail": "assets/images/[category]/filename.jpg",
  "videoUrl": "https://www.youtube.com/watch?v=VIDEO_ID",
  "category": "category-tag",
  "awards": ["Award Name — Festival 2024"]
}
```

3. Add the thumbnail image to the corresponding `assets/images/` folder

4. Commit and push changes

### Changing Contact Information

Edit the contact section in `index.html`:
- Studio address
- Email address
- Phone number
- Social media links

### Updating Statistics

Edit the about section in `index.html`:
- Projects delivered count
- Happy clients count
- Awards won count

## 🎥 Video Integration

Videos are embedded via YouTube. To add a video URL:

1. Get your YouTube video ID (the part after `?v=` in the URL)
2. Add the full URL to the `videoUrl` field in the JSON
3. The modal will automatically embed the video when clicked

Example:
```json
"videoUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
```

## 🖼 Adding Images

### Recommended Image Sizes

- **Project Thumbnails**: 800x500px (16:10 aspect ratio)
- **Hero Background**: 1920x1080px
- **About Image**: 600x750px (4:5 aspect ratio)

### Supported Formats
- JPEG (recommended for photos)
- PNG (for graphics with transparency)
- WebP (for modern browsers)

## 🚀 Deployment

### GitHub Pages

1. Push to a GitHub repository
2. Go to Settings → Pages
3. Select source branch (usually `main`)
4. Site will be live at `username.github.io/repo-name`

### Other Static Hosts

Simply upload all files to:
- Netlify
- Vercel
- AWS S3
- Any web server

No build step required!

## 🎨 Customization

### Changing Colors

Edit CSS custom properties in `css/styles.css`:

```css
:root {
    --color-bg-primary: #0a0a0c;      /* Main background */
    --color-accent: #1e3a5f;           /* Blue accent */
    --color-gold: #c9a227;             /* Gold highlights */
    --color-text-primary: #f5f5f7;     /* Main text */
}
```

### Changing Fonts

1. Update the Google Fonts import at the top of `styles.css`
2. Update the font-family variables:

```css
:root {
    --font-display: 'Cinzel', serif;
    --font-body: 'Raleway', sans-serif;
}
```

## 📱 Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)
- Mobile browsers (iOS Safari, Chrome for Android)

## 📄 License

© 2025 Light & Shadow Media. All rights reserved.


