import { createError, ErrorTypes, TitanBotError } from './errorHandler.js';
import { resolveErrorCode, getErrorMetadata } from './errorRegistry.js';

function normalizeBoundaryContext(context = {}) {
    if (!context || typeof context !== 'object') return {};
    return context;
}

/**
 * Infer an ErrorType from an error object.
 * Same philosophy as categorizeError — only use unambiguous signals.
 */
function inferErrorType(error, fallbackType = ErrorTypes.UNKNOWN) {
    const message = (error?.message || '').toLowerCase();
    const code    = error?.code;

    // Typed string codes from our own system
    if (typeof code === 'string') {
        if (code.includes('PERMISSION') || code.includes('FORBIDDEN')) return ErrorTypes.PERMISSION;
        if (code.includes('VALIDATION') || code === 'VALIDATION_FAILED')  return ErrorTypes.VALIDATION;
        if (code.includes('DB') || code.includes('SQL') || code.includes('POSTGRES')) return ErrorTypes.DATABASE;
    }

    // Numeric Discord API codes
    if (typeof code === 'number') {
        if (code === 50013 || code === 50001) return ErrorTypes.PERMISSION;
        if (code === 429)                     return ErrorTypes.RATE_LIMIT;
    }

    // Clear signals only — no broad keyword matching
    if (message.includes('missing permissions') || message.startsWith('missing access')) return ErrorTypes.PERMISSION;
    if (message.includes('database') || message.includes('econnrefused') || message.includes('sql')) return ErrorTypes.DATABASE;
    if (message.includes('rate limit')) return ErrorTypes.RATE_LIMIT;

    return fallbackType;
}

export function ensureTypedServiceError(error, options = {}) {
    if (error instanceof TitanBotError) return error;

    const context   = normalizeBoundaryContext(options.context);
    const fallback  = options.type || ErrorTypes.UNKNOWN;
    const type      = inferErrorType(error, fallback);
    const service   = options.service   || 'unknown_service';
    const operation = options.operation || 'unknown_operation';

    const errorCode = resolveErrorCode({
        error,
        errorType: type,
        context: { errorCode: options.errorCode || `${service}.${operation}.failed` }
    });
    const errorMetadata = getErrorMetadata(errorCode);
    const message       = options.message    || `${service}.${operation} failed`;
    const userMessage   = options.userMessage || 'Something went wrong while processing your request.';

    return createError(message, type, userMessage, {
        ...context,
        service,
        operation,
        errorCode,
        remediationHint: errorMetadata.remediation,
        severity:        errorMetadata.severity,
        retryable:       errorMetadata.retryable,
        originalErrorMessage: error?.message || String(error),
        originalErrorName:    error?.name    || 'Error',
        expected: false
    });
}

export function wrapServiceBoundary(fn, options = {}) {
    return function wrappedServiceBoundary(...args) {
        try {
            const result = fn.apply(this, args);
            if (result && typeof result.then === 'function') {
                return result.catch((error) => {
                    throw ensureTypedServiceError(
                        error,
                        typeof options === 'function' ? options(...args) : options
                    );
                });
            }
            return result;
        } catch (error) {
            throw ensureTypedServiceError(
                error,
                typeof options === 'function' ? options(...args) : options
            );
        }
    };
}

export function wrapServiceClassMethods(ServiceClass, optionsFactory) {
    const methodNames = Object.getOwnPropertyNames(ServiceClass)
        .filter(name => name !== 'length' && name !== 'name' && name !== 'prototype')
        .filter(name => typeof ServiceClass[name] === 'function');

    for (const methodName of methodNames) {
        ServiceClass[methodName] = wrapServiceBoundary(
            ServiceClass[methodName],
            (...args) => {
                const base = typeof optionsFactory === 'function'
                    ? optionsFactory(methodName, ...args) : {};
                return { service: ServiceClass.name || 'ServiceClass', operation: methodName, ...base };
            }
        );
    }
    return ServiceClass;
}
