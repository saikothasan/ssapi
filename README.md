# Website Screenshot API

A professional, production-ready screenshot API built with Express.js and Puppeteer, optimized for deployment on Vercel.

## Features

- 🚀 **Fast & Reliable**: Optimized for serverless deployment
- 📱 **Mobile Support**: Mobile viewport simulation
- 🎨 **Format Options**: PNG, JPEG, WebP support
- 🔧 **Highly Configurable**: Width, height, full page, selectors, and more
- 🛡️ **Rate Limited**: Built-in protection against abuse
- 📊 **Health Monitoring**: Health check endpoint
- 🌙 **Dark Mode**: Force dark mode screenshots
- 📱 **Responsive**: Mobile and desktop viewport options
- ⚡ **Performance**: Caching headers and optimized processing

## Quick Start

### Local Development

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
4. API will be available at `http://localhost:3000`

### Vercel Deployment

1. Install Vercel CLI:
   ```bash
   npm install -g vercel
   ```

2. Deploy to Vercel:
   ```bash
   vercel --prod
   ```

3. Your API will be live at `https://your-project.vercel.app`

### Manual Vercel Deployment

1. Push your code to GitHub
2. Connect your repository to Vercel
3. Vercel will automatically detect and deploy your Express.js app

## API Endpoints

### `GET /screenshot`

Capture a screenshot of any website with extensive customization options.

#### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `url` | `string` | **required** | The URL to screenshot |
| `width` | `number` | `1920` | Viewport width (100-3840) |
| `height` | `number` | `1080` | Viewport height (100-2160) |
| `fullPage` | `boolean` | `false` | Capture full page height |
| `format` | `string` | `png` | Image format (png, jpeg, webp) |
| `quality` | `number` | `80` | Image quality 1-100 (jpeg/webp only) |
| `delay` | `number` | `0` | Delay before screenshot (0-10000ms) |
| `selector` | `string` | `null` | CSS selector for specific element |
| `mobile` | `boolean` | `false` | Use mobile viewport |
| `darkMode` | `boolean` | `false` | Force dark mode |

#### Examples

```bash
# Basic screenshot
curl "https://your-api.vercel.app/screenshot?url=https://example.com"

# Custom dimensions and format
curl "https://your-api.vercel.app/screenshot?url=https://example.com&width=1200&height=800&format=jpeg&quality=90"

# Full page mobile screenshot
curl "https://your-api.vercel.app/screenshot?url=https://example.com&fullPage=true&mobile=true"

# Screenshot specific element
curl "https://your-api.vercel.app/screenshot?url=https://example.com&selector=.header"

# Dark mode screenshot
curl "https://your-api.vercel.app/screenshot?url=https://example.com&darkMode=true"
```

### `GET /health`

Check API health and status.

```bash
curl "https://your-api.vercel.app/health"
```

### `GET /`

Get complete API documentation.

```bash
curl "https://your-api.vercel.app/"
```

## Response Headers

The API includes helpful response headers:

- `X-Processing-Time`: Screenshot processing time
- `X-Screenshot-URL`: Original URL
- `X-Screenshot-Dimensions`: Image dimensions
- `X-Screenshot-Format`: Image format
- `Cache-Control`: Caching instructions

## Rate Limiting

- **100 requests per 15 minutes** per IP address
- Rate limit headers included in responses
- Automatic retry-after information

## Error Handling

The API provides detailed error responses:

```json
{
  "error": "Invalid URL format",
  "message": "Please provide a valid HTTP/HTTPS URL",
  "provided": "invalid-url"
}
```

Common error codes:
- `400`: Bad request (invalid parameters)
- `408`: Request timeout (website took too long to load)
- `429`: Rate limit exceeded
- `500`: Internal server error

## Environment Variables

Set these environment variables for customization:

- `NODE_ENV`: Set to "production" for production deployment
- `PORT`: Server port (default: 3000)

## Security Features

- CORS enabled for cross-origin requests
- Rate limiting to prevent abuse
- URL validation to prevent malicious requests
- Timeout protection (30 seconds max)
- Memory usage monitoring

## Performance Optimization

- Chromium browser pooling
- Image compression
- Response caching headers
- Optimized Puppeteer settings
- Memory management

## Troubleshooting

### Common Issues

1. **Screenshots taking too long**
   - Increase the delay parameter
   - Check if the website requires authentication
   - Verify the URL is accessible

2. **Rate limit exceeded**
   - Wait 15 minutes before retrying
   - Consider implementing your own caching layer

3. **Image quality issues**
   - Adjust quality parameter (1-100)
   - Try different formats (png for lossless, jpeg for smaller files)

### Debug Mode

Enable detailed logging in development:

```bash
NODE_ENV=development npm start
```

## License

MIT License - see LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## Support

For issues and questions:
- Create an issue on GitHub
- Check the health endpoint: `/health`
- Review the API documentation: `/`

## Changelog

### v1.0.0
- Initial release
- Full screenshot functionality
- Vercel deployment support
- Rate limiting
- Health monitoring
- Mobile viewport support
- Dark mode support
