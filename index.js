const express = require('express');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();

// Middleware
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Trust proxy for rate limiting
app.set('trust proxy', 1);

// Enhanced rate limiting with different tiers
const createRateLimit = (windowMs, max, message) => rateLimit({
  windowMs,
  max,
  message: { error: message, retryAfter: Math.ceil(windowMs / 60000) + ' minutes' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/health' || req.path === '/';
  }
});

// Different rate limits for different endpoints
const screenshotLimiter = createRateLimit(
  15 * 60 * 1000, // 15 minutes
  50, // 50 requests per 15 minutes
  'Screenshot rate limit exceeded. Please try again later.'
);

// Global rate limiter (more permissive)
const globalLimiter = createRateLimit(
  5 * 60 * 1000, // 5 minutes  
  200, // 200 requests per 5 minutes
  'Too many requests. Please slow down.'
);

app.use(globalLimiter);
app.use('/screenshot', screenshotLimiter);

// Request timeout middleware
const timeoutMiddleware = (req, res, next) => {
  const timeout = 25000; // 25 seconds (5s buffer for Vercel's 30s limit)
  
  const timer = setTimeout(() => {
    if (!res.headersSent) {
      res.status(408).json({
        error: 'Request timeout',
        message: 'Screenshot took too long to process',
        timeout: `${timeout / 1000}s`
      });
    }
  }, timeout);

  res.on('finish', () => clearTimeout(timer));
  res.on('close', () => clearTimeout(timer));
  
  next();
};

// Enhanced URL validation middleware
const validateUrl = (req, res, next) => {
  const { url } = req.query;
  
  if (!url) {
    return res.status(400).json({
      error: 'URL parameter is required',
      example: '/screenshot?url=https://example.com',
      documentation: req.get('host') + '/'
    });
  }

  try {
    const urlObj = new URL(url);
    
    // Protocol validation
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      throw new Error('Only HTTP and HTTPS protocols are supported');
    }

    // Block localhost and private IPs in production
    if (process.env.NODE_ENV === 'production') {
      const hostname = urlObj.hostname.toLowerCase();
      const privateIpRegex = /^(10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.|127\.|169\.254\.|::1$|localhost$)/;
      
      if (privateIpRegex.test(hostname)) {
        throw new Error('Private and localhost URLs are not allowed');
      }
    }

    // Block suspicious patterns
    const suspiciousPatterns = [
      /file:\/\//i,
      /javascript:/i,
      /data:/i,
      /vbscript:/i
    ];

    if (suspiciousPatterns.some(pattern => pattern.test(url))) {
      throw new Error('Suspicious URL pattern detected');
    }

    req.validatedUrl = url;
    next();
  } catch (error) {
    return res.status(400).json({
      error: 'Invalid URL',
      message: error.message,
      provided: url
    });
  }
};

// Enhanced parameter validation middleware
const validateParams = (req, res, next) => {
  const {
    width = 1920,
    height = 1080,
    quality = 80,
    delay = 0,
    format = 'png',
    fullPage = 'false',
    mobile = 'false',
    darkMode = 'false'
  } = req.query;

  try {
    // Numeric validations
    const widthNum = parseInt(width);
    const heightNum = parseInt(height);
    const qualityNum = parseInt(quality);
    const delayNum = parseInt(delay);

    if (isNaN(widthNum) || widthNum < 100 || widthNum > 1920) {
      throw new Error('Width must be between 100 and 1920 pixels');
    }
    if (isNaN(heightNum) || heightNum < 100 || heightNum > 1080) {
      throw new Error('Height must be between 100 and 1080 pixels');
    }
    if (!['png', 'jpeg', 'webp'].includes(format.toLowerCase())) {
      throw new Error('Format must be png, jpeg, or webp');
    }
    if (isNaN(qualityNum) || qualityNum < 1 || qualityNum > 100) {
      throw new Error('Quality must be between 1 and 100');
    }
    if (isNaN(delayNum) || delayNum < 0 || delayNum > 5000) {
      throw new Error('Delay must be between 0 and 5000 milliseconds');
    }

    // Boolean validations
    const validBooleans = ['true', 'false'];
    if (!validBooleans.includes(fullPage.toLowerCase())) {
      throw new Error('fullPage must be true or false');
    }
    if (!validBooleans.includes(mobile.toLowerCase())) {
      throw new Error('mobile must be true or false');
    }
    if (!validBooleans.includes(darkMode.toLowerCase())) {
      throw new Error('darkMode must be true or false');
    }

    // Store validated params
    req.validatedParams = {
      width: widthNum,
      height: heightNum,
      quality: qualityNum,
      delay: delayNum,
      format: format.toLowerCase(),
      fullPage: fullPage.toLowerCase() === 'true',
      mobile: mobile.toLowerCase() === 'true',
      darkMode: darkMode.toLowerCase() === 'true'
    };

    next();
  } catch (error) {
    return res.status(400).json({
      error: 'Invalid parameters',
      message: error.message
    });
  }
};

// Optimized browser instance for Vercel
const getBrowser = async () => {
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (isProduction) {
    // Vercel/serverless configuration
    return puppeteer.launch({
      args: [
        ...chromium.args,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--run-all-compositor-stages-before-draw',
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows',
        '--disable-ipc-flooding-protection',
        '--single-process'
      ],
      defaultViewport: { width: 1920, height: 1080 },
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
      ignoreDefaultArgs: ['--disable-extensions'],
      timeout: 30000
    });
  } else {
    // Local development
    return puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu'
      ],
      defaultViewport: { width: 1920, height: 1080 },
      timeout: 30000
    });
  }
};

// Main screenshot endpoint
app.get('/screenshot', timeoutMiddleware, validateUrl, validateParams, async (req, res) => {
  const { validatedUrl: url, validatedParams: params } = req;
  const { selector } = req.query;
  
  const startTime = Date.now();
  let browser = null;
  let page = null;

  try {
    console.log(`ðŸ“¸ Starting screenshot: ${url}`);
    
    // Launch browser with timeout
    const browserPromise = getBrowser();
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Browser launch timeout')), 10000);
    });
    
    browser = await Promise.race([browserPromise, timeoutPromise]);
    page = await browser.newPage();

    // Set up page with error handling
    page.setDefaultTimeout(15000);
    page.setDefaultNavigationTimeout(15000);

    // Set viewport
    await page.setViewport({
      width: params.width,
      height: params.height,
      isMobile: params.mobile,
      deviceScaleFactor: params.mobile ? 2 : 1,
      hasTouch: params.mobile
    });

    // Set user agent
    const userAgent = params.mobile 
      ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1'
      : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    
    await page.setUserAgent(userAgent);

    // Set dark mode preference
    if (params.darkMode) {
      await page.emulateMediaFeatures([
        { name: 'prefers-color-scheme', value: 'dark' }
      ]);
    }

    // Block unnecessary resources for faster loading
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const resourceType = request.resourceType();
      const url = request.url();
      
      // Block ads, analytics, and heavy resources
      const blockedDomains = [
        'google-analytics.com',
        'googletagmanager.com',
        'facebook.com',
        'doubleclick.net',
        'googlesyndication.com'
      ];
      
      if (
        ['font', 'media'].includes(resourceType) ||
        blockedDomains.some(domain => url.includes(domain))
      ) {
        request.abort();
      } else {
        request.continue();
      }
    });

    // Navigate with comprehensive error handling
    try {
      await page.goto(url, {
        waitUntil: ['domcontentloaded', 'networkidle2'],
        timeout: 15000
      });
    } catch (navigationError) {
      // Try with more lenient wait conditions
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 10000
      });
    }

    // Additional delay if specified
    if (params.delay > 0) {
      await page.waitForTimeout(params.delay);
    }

    // Wait for any lazy-loaded content
    await page.evaluate(() => {
      return new Promise((resolve) => {
        if (document.readyState === 'complete') {
          resolve();
        } else {
          window.addEventListener('load', resolve);
          // Fallback timeout
          setTimeout(resolve, 2000);
        }
      });
    });

    // Screenshot options
    const screenshotOptions = {
      type: params.format,
      fullPage: params.fullPage,
      omitBackground: params.format === 'png', // Transparent background for PNG
      captureBeyondViewport: params.fullPage,
      clip: null
    };

    // Add quality for lossy formats
    if (['jpeg', 'webp'].includes(params.format)) {
      screenshotOptions.quality = params.quality;
    }

    let screenshot;
    
    // Handle element-specific screenshots
    if (selector) {
      try {
        await page.waitForSelector(selector, { timeout: 5000 });
        const element = await page.$(selector);
        if (!element) {
          throw new Error(`Element with selector "${selector}" not found`);
        }
        screenshot = await element.screenshot(screenshotOptions);
      } catch (selectorError) {
        throw new Error(`Failed to find or screenshot element "${selector}": ${selectorError.message}`);
      }
    } else {
      screenshot = await page.screenshot(screenshotOptions);
    }

    const processingTime = Date.now() - startTime;
    
    console.log(`âœ… Screenshot completed: ${url} (${processingTime}ms)`);

    // Set comprehensive response headers
    const headers = {
      'Content-Type': `image/${params.format}`,
      'Content-Length': screenshot.length,
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      'X-Processing-Time': `${processingTime}ms`,
      'X-Screenshot-URL': url,
      'X-Screenshot-Dimensions': `${params.width}x${params.height}`,
      'X-Screenshot-Format': params.format,
      'X-Screenshot-Size': `${Math.round(screenshot.length / 1024)}KB`,
      'X-Timestamp': new Date().toISOString(),
      'Vary': 'Accept-Encoding'
    };

    res.set(headers);
    res.send(screenshot);

  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    console.error(`âŒ Screenshot failed: ${url} - ${error.message}`);
    
    // Enhanced error handling with specific error types
    let statusCode = 500;
    let errorMessage = 'Failed to capture screenshot';
    
    if (error.message.includes('net::ERR_NAME_NOT_RESOLVED')) {
      statusCode = 400;
      errorMessage = 'Website not found or unreachable';
    } else if (error.message.includes('net::ERR_CONNECTION_REFUSED')) {
      statusCode = 400;
      errorMessage = 'Connection refused by target website';
    } else if (error.message.includes('Navigation timeout') || error.message.includes('timeout')) {
      statusCode = 408;
      errorMessage = 'Website took too long to load';
    } else if (error.message.includes('ERR_BLOCKED_BY_CLIENT')) {
      statusCode = 400;
      errorMessage = 'Request blocked by target website';
    } else if (error.message.includes('ERR_TOO_MANY_REDIRECTS')) {
      statusCode = 400;
      errorMessage = 'Too many redirects';
    } else if (error.message.includes('Element') && error.message.includes('not found')) {
      statusCode = 400;
      errorMessage = error.message;
    }

    if (!res.headersSent) {
      res.status(statusCode).json({
        error: errorMessage,
        message: error.message,
        url: url,
        processingTime: `${processingTime}ms`,
        timestamp: new Date().toISOString(),
        requestId: req.get('x-vercel-id') || 'local'
      });
    }
    
  } finally {
    // Cleanup resources
    try {
      if (page) {
        await page.close();
      }
      if (browser) {
        await browser.close();
      }
    } catch (cleanupError) {
      console.error('Cleanup error:', cleanupError.message);
    }
  }
});

// Enhanced health check endpoint
app.get('/health', (req, res) => {
  const memoryUsage = process.memoryUsage();
  const uptime = process.uptime();
  
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: {
      seconds: Math.floor(uptime),
      human: `${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s`
    },
    memory: {
      used: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
      total: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
      external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`
    },
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0',
    nodejs: process.version,
    platform: process.platform
  });
});

// Comprehensive API documentation
app.get('/', (req, res) => {
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  
  res.json({
    name: 'Professional Website Screenshot API',
    version: '1.0.0',
    description: 'High-performance screenshot service with advanced customization options',
    baseUrl: baseUrl,
    documentation: {
      endpoints: {
        screenshot: {
          method: 'GET',
          path: '/screenshot',
          description: 'Capture website screenshots with extensive customization',
          required: ['url'],
          parameters: {
            url: {
              type: 'string',
              required: true,
              description: 'Target website URL (HTTP/HTTPS only)',
              example: 'https://example.com'
            },
            width: {
              type: 'integer',
              default: 1920,
              range: '100-1920',
              description: 'Viewport width in pixels'
            },
            height: {
              type: 'integer', 
              default: 1080,
              range: '100-1080',
              description: 'Viewport height in pixels'
            },
            format: {
              type: 'string',
              default: 'png',
              options: ['png', 'jpeg', 'webp'],
              description: 'Output image format'
            },
            quality: {
              type: 'integer',
              default: 80,
              range: '1-100',
              description: 'Image quality (JPEG/WebP only)'
            },
            fullPage: {
              type: 'boolean',
              default: false,
              description: 'Capture entire page height'
            },
            mobile: {
              type: 'boolean',
              default: false,
              description: 'Use mobile viewport and user agent'
            },
            darkMode: {
              type: 'boolean',
              default: false,
              description: 'Force dark color scheme'
            },
            delay: {
              type: 'integer',
              default: 0,
              range: '0-5000',
              description: 'Delay before capture (milliseconds)'
            },
            selector: {
              type: 'string',
              optional: true,
              description: 'CSS selector for specific element capture'
            }
          }
        },
        health: {
          method: 'GET',
          path: '/health',
          description: 'Service health and status information'
        }
      },
      examples: [
        `${baseUrl}/screenshot?url=https://example.com`,
        `${baseUrl}/screenshot?url=https://example.com&width=1200&height=800&format=jpeg&quality=90`,
        `${baseUrl}/screenshot?url=https://example.com&fullPage=true&mobile=true&darkMode=true`,
        `${baseUrl}/screenshot?url=https://example.com&selector=.header&format=webp&quality=85`
      ],
      limits: {
        rateLimit: '50 screenshots per 15 minutes per IP',
        timeout: '25 seconds per request',
        maxDimensions: '1920x1080 pixels',
        maxDelay: '5 seconds'
      },
      features: [
        'Multi-format support (PNG, JPEG, WebP)',
        'Mobile and desktop viewports',
        'Full-page capture capability',
        'Element-specific screenshots',
        'Dark mode support',
        'Advanced error handling',
        'Response caching',
        'Rate limiting protection'
      ]
    },
    status: 'operational',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    message: `The endpoint ${req.originalUrl} does not exist`,
    availableEndpoints: ['/', '/screenshot', '/health'],
    documentation: `${req.protocol}://${req.get('host')}/`
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  
  if (!res.headersSent) {
    res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'production' 
        ? 'An unexpected error occurred' 
        : error.message,
      timestamp: new Date().toISOString(),
      requestId: req.get('x-vercel-id') || 'local'
    });
  }
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Export for Vercel
module.exports = app;
