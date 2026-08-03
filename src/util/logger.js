const fs = require('fs');
const path = require('path');
const winston = require('winston');
const { config } = require('./config');

if (!fs.existsSync(config.logging.dir)) {
  fs.mkdirSync(config.logging.dir, { recursive: true });
}

const { combine, timestamp, printf, colorize, errors } = winston.format;

const logFormat = printf(({ level, message, timestamp: ts, stack, module: mod, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  const modStr = mod ? `[${mod}] ` : '';
  return `${ts} ${level}: ${modStr}${stack || message}${metaStr}`;
});

const logger = winston.createLogger({
  level: config.logging.level,
  format: combine(timestamp(), errors({ stack: true }), logFormat),
  transports: [
    new winston.transports.Console({
      format: combine(colorize(), timestamp(), errors({ stack: true }), logFormat),
    }),
    new winston.transports.File({
      filename: path.join(config.logging.dir, 'controller.log'),
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(config.logging.dir, 'errors.log'),
      level: 'error',
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    }),
  ],
  exceptionHandlers: [
    new winston.transports.File({ filename: path.join(config.logging.dir, 'crashes.log') }),
  ],
  rejectionHandlers: [
    new winston.transports.File({ filename: path.join(config.logging.dir, 'crashes.log') }),
  ],
});

function childLogger(moduleName) {
  return logger.child({ module: moduleName });
}

module.exports = { logger, childLogger };
