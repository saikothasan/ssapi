const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  }
});

app.use('/screenshot', limiter);

// Validation middleware
const validateUrl = (req, res, next) => {
  const { url } = req.query;
  
  if (!url) {
    return res.status(400).json({
      error: 'URL parameter is required',
      example: '/screenshot?url=https://example.com'
    });
  }

  try {
    const urlObj = new URL(url);
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      throw new Error('Invalid protocol');
    }
    req.validatedUrl = url;
    next();
  } catch (error) {
    return res.status(400).json({
      error: 'Invalid URL format. Please provide a valid HTTP/HTTPS URL.',
      provided: url
    });
  }
};

// Helper function to get browser instance
const getBrowser = async () => {
  const isDev = process.env.NODE_ENV !== 'production';
  
  if (isDev) {
    return puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920x1080'
      ]
    });
  } else {
    // Vercel configuration
    return puppeteer.launch({
      headless: 'new',
      executablePath: '/usr/bin/chromium-browser',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920x1080',
        '--single-process',
        '--no-zygote'
      ]
    });
  }
};

// Screenshot endpoint
app.get('/screenshot', validateUrl, async (req, res) => {
  const {
    url,
    width = 1920,
    height = 1080,
    fullPage = 'false',
    format = 'png',
    quality = 80,
    delay = 0,
    selector = null,
    mobile = 'false',
    darkMode = 'false'
  } = req.query;

  const startTime = Date.now();
  let browser = null;

  try {
    // Input validation
    const widthNum = parseInt(width);
    const heightNum = parseInt(height);
    const qualityNum = parseInt(quality);
    const delayNum = parseInt(delay);

    if (widthNum < 100 || widthNum > 3840) {
      return res.status(400).json({ error: 'Width must be between 100 and 3840 pixels' });
    }
    if (heightNum < 100 || heightNum > 2160) {
      return res.status(400).json({ error: 'Height must be between 100 and 2160 pixels' });
    }
    if (!['png', 'jpeg', 'webp'].includes(format)) {
      return res.status(400).json({ error: 'Format must be png, jpeg, or webp' });
    }
    if (qualityNum < 1 || qualityNum > 100) {
      return res.status(400).json({ error: 'Quality must be between 1 and 100' });
    }
    if (delayNum < 0 || delayNum > 10000) {
      return res.status(400).json({ error: 'Delay must be between 0 and 10000 milliseconds' });
    }

    console.log(`📸 Taking screenshot of: ${url}`);
    
    browser = await getBrowser();
    const page = await browser.newPage();

    // Set viewport
    await page.setViewport({
      width: widthNum,
      height: heightNum,
      isMobile: mobile === 'true',
      deviceScaleFactor: mobile === 'true' ? 2 : 1
    });

    // Set dark mode if requested
    if (darkMode === 'true') {
      await page.emulateMediaFeatures([
        { name: 'prefers-color-scheme', value: 'dark' }
      ]);
    }

    // Set user agent
    await page.setUserAgent(
      mobile === 'true' 
        ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1'
        : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    );

    // Navigate to page with timeout
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Wait for additional delay if specified
    if (delayNum > 0) {
      await page.waitForTimeout(delayNum);
    }

    // Screenshot options
    const screenshotOptions = {
      type: format,
      fullPage: fullPage === 'true',
      clip: selector ? null : undefined
    };

    // Add quality for jpeg/webp
    if (format === 'jpeg' || format === 'webp') {
      screenshotOptions.quality = qualityNum;
    }

    let screenshot;
    
    // Take screenshot of specific element if selector provided
    if (selector) {
      const element = await page.$(selector);
      if (!element) {
        throw new Error(`Element with selector "${selector}" not found`);
      }
      screenshot = await element.screenshot(screenshotOptions);
    } else {
      screenshot = await page.screenshot(screenshotOptions);
    }

    const processingTime = Date.now() - startTime;
    
    console.log(`✅ Screenshot completed in ${processingTime}ms`);

    // Set response headers
    res.set({
      'Content-Type': `image/${format}`,
      'Content-Length': screenshot.length,
      'Cache-Control': 'public, max-age=3600',
      'X-Processing-Time': `${processingTime}ms`,
      'X-Screenshot-URL': url,
      'X-Screenshot-Dimensions': `${widthNum}x${heightNum}`,
      'X-Screenshot-Format': format
    });

    res.send(screenshot);

  } catch (error) {
    console.error('❌ Screenshot error:', error.message);
    
    const processingTime = Date.now() - startTime;
    
    // Handle specific error types
    if (error.message.includes('net::ERR_NAME_NOT_RESOLVED')) {
      return res.status(400).json({
        error: 'Website not found or unreachable',
        url: url,
        processingTime: `${processingTime}ms`
      });
    }
    
    if (error.message.includes('Navigation timeout')) {
      return res.status(408).json({
        error: 'Website took too long to load (30s timeout)',
        url: url,
        processingTime: `${processingTime}ms`
      });
    }

    res.status(500).json({
      error: 'Failed to capture screenshot',
      message: error.message,
      url: url,
      processingTime: `${processingTime}ms`
    });
    
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: '1.0.0'
  });
});

// API documentation endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Website Screenshot API',
    version: '1.0.0',
    description: 'Capture screenshots of websites with customizable options',
    endpoints: {
      screenshot: {
        method: 'GET',
        path: '/screenshot',
        description: 'Capture a screenshot of a website',
        parameters: {
          url: {
            type: 'string',
            required: true,
            description: 'The URL of the website to screenshot',
            example: 'https://example.com'
          },
          width: {
            type: 'number',
            default: 1920,
            range: '100-3840',
            description: 'Screenshot width in pixels'
          },
          height: {
            type: 'number',
            default: 1080,
            range: '100-2160',
            description: 'Screenshot height in pixels'
          },
          fullPage: {
            type: 'boolean',
            default: false,
            description: 'Capture full page height'
          },
          format: {
            type: 'string',
            default: 'png',
            options: ['png', 'jpeg', 'webp'],
            description: 'Image format'
          },
          quality: {
            type: 'number',
            default: 80,
            range: '1-100',
            description: 'Image quality (jpeg/webp only)'
          },
          delay: {
            type: 'number',
            default: 0,
            range: '0-10000',
            description: 'Delay before screenshot in milliseconds'
          },
          selector: {
            type: 'string',
            optional: true,
            description: 'CSS selector to screenshot specific element'
          },
          mobile: {
            type: 'boolean',
            default: false,
            description: 'Use mobile viewport and user agent'
          },
          darkMode: {
            type: 'boolean',
            default: false,
            description: 'Force dark mode'
          }
        },
        examples: [
          '/screenshot?url=https://example.com',
          '/screenshot?url=https://example.com&width=1200&height=800&format=jpeg&quality=90',
          '/screenshot?url=https://example.com&fullPage=true&mobile=true',
          '/screenshot?url=https://example.com&selector=.header&format=webp'
        ]
      },
      health: {
        method: 'GET',
        path: '/health',
        description: 'Check API health status'
      }
    },
    limits: {
      rateLimit: '100 requests per 15 minutes per IP',
      timeout: '30 seconds per request',
      maxDimensions: '3840x2160 pixels'
    }
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    message: 'Please check the API documentation at /',
    availableEndpoints: ['/', '/screenshot', '/health']
  });
});

// Error handler
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: error.message
  });
});

// Start server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Screenshot API running on port ${PORT}`);
    console.log(`📖 API documentation: http://localhost:${PORT}/`);
    console.log(`🔍 Health check: http://localhost:${PORT}/health`);
  });
}

module.exports = app;
