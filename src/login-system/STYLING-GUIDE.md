# Styling Guide - Gantt Chart Builder

This guide explains how to easily customize colors, styles, and layout of your login system.

## 📋 Quick Reference

### Changing Colors

All colors are defined at the **top of `css/styles.css`** (lines 8-28). Change them once and they update everywhere!

```css
:root {
    /* Brand Colors - Change these to update the entire theme */
    --primary-color: #003366;           /* Main blue - buttons, links, accents */
    --primary-hover: #004080;           /* Hover state for buttons */
    --secondary-color: #f7f7f7;         /* Secondary button background */

    /* Background Colors */
    --bg-white: #ffffff;                /* Main background */
    --bg-light: #f3f9f6;                /* Card header background */
    --bg-gray: #f7f7f7;                 /* Alternate background */

    /* Text Colors */
    --text-primary: #000000;            /* Main text color */
    --text-secondary: #6c757d;          /* Muted/secondary text */

    /* Border & Lines */
    --border-color: #dee2e6;            /* All borders and dividers */

    /* Status Colors */
    --color-success: #059669;           /* Success messages */
    --color-error: #dc2626;             /* Error messages */
}
```

### Common Customizations

#### 1. Change Button Color
**To change from blue to purple:**
```css
--primary-color: #5E33BF;           /* Purple */
--primary-hover: #6b40cc;           /* Lighter purple */
```

#### 2. Change Card Width
```css
--card-max-width: 450px;            /* Make wider: 600px, narrower: 350px */
```

#### 3. Change Header Logo Size
**In `css/styles.css`, section 3 (line 80-83):**
```css
.header-logo img {
    height: 50px;                   /* Change to 60px for larger, 40px for smaller */
    width: auto;
}
```

#### 4. Change Background Color
```css
--bg-white: #f8f9fa;                /* Light gray instead of white */
--bg-light: #e3f2fd;                /* Light blue tint */
```

## 📁 File Organization

### CSS Structure (css/styles.css)
The CSS is organized into 12 clear sections:

1. **CSS Variables** (Lines 8-34) - All colors, spacing, sizes
2. **Base Styles** (Lines 39-53) - Body, fonts, layout
3. **Header** (Lines 58-89) - Top navigation bar
4. **Main Content** (Lines 94-100) - Page container
5. **Login Card** (Lines 105-137) - Card container and header
6. **Forms** (Lines 142-187) - Input fields, labels
7. **Buttons** (Lines 192-237) - Primary, secondary, disabled states
8. **Messages** (Lines 242-266) - Error and success alerts
9. **Dashboard** (Lines 271-336) - After-login view
10. **Footer** (Lines 341-348) - Bottom section
11. **Loading Spinner** (Lines 353-364) - Button loading state
12. **Responsive Design** (Lines 369-390) - Mobile/tablet adjustments

### HTML Structure (index.html)
Organized with clear comments:

```html
<!-- ========== HEADER ========== -->
<!-- ========== MAIN CONTENT ========== -->
    <!-- LOGIN FORM -->
    <!-- DASHBOARD -->
<!-- ========== FOOTER ========== -->
```

## 🎨 CSS Class Reference

### Layout Classes
- `.header` - Top navigation bar
- `.main` - Main content container
- `.footer` - Bottom footer

### Card Classes
- `.login-card` - Card container
- `.card-header` - Card header (with colored background)
- `.card-body` - Card content area

### Form Classes
- `.form-group` - Form field container
- `.form-label` - Field label
- `.form-input` - Text input field
- `.input-wrapper` - Wrapper for input with icon
- `.input-icon` - Icon inside input field

### Button Classes
- `.btn` - Base button style
- `.btn-primary` - Blue action button
- `.btn-secondary` - Gray secondary button

### Dashboard Classes
- `.dashboard` - Dashboard container
- `.user-avatar` - Circular user avatar
- `.welcome-name` - User name heading
- `.welcome-email` - User email text
- `.project-badge` - Project ID badge
- `.dashboard-message` - Success message text

### Message Classes
- `.message` - Message container
- `.message-error` - Error message
- `.message-success` - Success message

## 🔧 Common Tasks

### Task 1: Change Theme to Purple
```css
/* In css/styles.css, line 10-11 */
--primary-color: #5E33BF;
--primary-hover: #6b40cc;
```

### Task 2: Make Card Wider
```css
/* In css/styles.css, line 32 */
--card-max-width: 550px;  /* Default is 450px */
```

### Task 3: Change Header Background
```css
/* In css/styles.css, line 59 */
.header {
    background: #f8f9fa;  /* Light gray instead of white */
    /* ... rest stays the same ... */
}
```

### Task 4: Remove Card Header Background Color
```css
/* In css/styles.css, line 116 */
.card-header {
    background: var(--bg-white);  /* Change from --bg-light */
    /* ... rest stays the same ... */
}
```

### Task 5: Add Rounded Corners to Card
```css
/* In css/styles.css, line 108 */
.login-card {
    border-radius: 16px;  /* Default is 8px */
    /* ... rest stays the same ... */
}
```

## 💡 Tips

1. **Always edit `css/styles.css`** - Never add inline styles to HTML
2. **Use CSS variables** - Change colors in one place (lines 8-28)
3. **Test on mobile** - Responsive styles start at line 369
4. **Clear browser cache** - Press Ctrl+F5 to see changes
5. **Keep comments** - They help you find things quickly

## 📝 Need Help?

- All color changes: Lines 8-28 in `css/styles.css`
- Button styles: Lines 192-237 in `css/styles.css`
- Card appearance: Lines 105-137 in `css/styles.css`
- Mobile responsive: Lines 369-390 in `css/styles.css`
