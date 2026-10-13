package generator

// SVGTemplate generates a self-contained animated vector file.
const SVGTemplate = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" 
     viewBox="0 0 {{.Width}} {{.Height}}" 
     width="100%" height="100%">
  <defs>
    <style>
      {{if eq .Preset "dramatic"}}
      @keyframes animEffect {
        0%   { transform: scale(1.0) translate(0%, 0%); }
        50%  { transform: scale(1.35) translate(-6%, -4%); }
        100% { transform: scale(1.0) translate(0%, 0%); }
      }
      {{else if eq .Preset "pulse"}}
      @keyframes animEffect {
        0%   { transform: scale(0.85); opacity: 0.75; }
        50%  { transform: scale(1.15); opacity: 1.0; }
        100% { transform: scale(0.85); opacity: 0.75; }
      }
      {{else if eq .Preset "pan"}}
      @keyframes animEffect {
        0%   { transform: scale(1.2) translateX(-8%); }
        50%  { transform: scale(1.2) translateX(8%); }
        100% { transform: scale(1.2) translateX(-8%); }
      }
      {{else}}
      @keyframes animEffect {
        0%   { transform: scale(1.0) translate(0%, 0%); }
        50%  { transform: scale(1.2) translate(-3%, -2%); }
        100% { transform: scale(1.0) translate(0%, 0%); }
      }
      {{end}}

      .anim-target {
        transform-box: fill-box;
        transform-origin: center center;
        animation: animEffect {{.Duration}} ease-in-out infinite;
      }
    </style>
  </defs>

  <g class="anim-target">
    <image width="{{.Width}}" height="{{.Height}}" 
           href="data:{{.MimeType}};base64,{{.Base64Data}}" 
           preserveAspectRatio="xMidYMid slice" />
  </g>
</svg>
`

// HTMLTemplate generates a self-contained responsive HTML viewing document.
const HTMLTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{.Title}} - Animated View</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      background-color: #0e1117;
      color: #e6edf3;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
    }
    .viewport {
      position: relative;
      width: 100%;
      max-width: {{.Width}}px;
      aspect-ratio: {{.Width}} / {{.Height}};
      overflow: hidden;
      border-radius: 8px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
      background-color: #161b22;
    }
    {{if eq .Preset "dramatic"}}
    @keyframes htmlAnim {
      0%   { transform: scale(1.0) translate(0%, 0%); }
      50%  { transform: scale(1.35) translate(-6%, -4%); }
      100% { transform: scale(1.0) translate(0%, 0%); }
    }
    {{else if eq .Preset "pulse"}}
    @keyframes htmlAnim {
      0%   { transform: scale(0.85); opacity: 0.75; }
      50%  { transform: scale(1.15); opacity: 1.0; }
      100% { transform: scale(0.85); opacity: 0.75; }
    }
    {{else if eq .Preset "pan"}}
    @keyframes htmlAnim {
      0%   { transform: scale(1.2) translateX(-8%); }
      50%  { transform: scale(1.2) translateX(8%); }
      100% { transform: scale(1.2) translateX(-8%); }
    }
    {{else}}
    @keyframes htmlAnim {
      0%   { transform: scale(1.0) translate(0%, 0%); }
      50%  { transform: scale(1.2) translate(-3%, -2%); }
      100% { transform: scale(1.0) translate(0%, 0%); }
    }
    {{end}}
    .animated-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transform-origin: center center;
      animation: htmlAnim {{.Duration}} ease-in-out infinite;
      display: block;
    }
    .meta {
      margin-top: 1rem;
      font-size: 0.85rem;
      color: #8b949e;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="viewport">
    <img class="animated-img" src="data:{{.MimeType}};base64,{{.Base64Data}}" alt="{{.Title}}">
  </div>
  <div class="meta">
    Preset: <strong>{{.Preset}}</strong> | Duration: <strong>{{.Duration}}</strong> | Native: <strong>{{.Width}}x{{.Height}}</strong>
  </div>
</body>
</html>
`