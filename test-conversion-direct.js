#!/usr/bin/env node

/**
 * Direct test of the base64 conversion logic
 */

const fs = require('fs');
const path = require('path');

console.log('=' .repeat(70));
console.log('TESTING BASE64 CONVERSION LOGIC');
console.log('=' .repeat(70));

// Check if the fileConverter utility was included in the build
const distPath = path.join(__dirname, 'dist', 'index.js');
const distContent = fs.readFileSync(distPath, 'utf-8');

// Search for the base64 conversion logic
console.log('\nSearching for base64 conversion logic in built SDK...\n');

// Check for fetchAndConvertToBase64 function
if (distContent.includes('fetchAndConvertToBase64')) {
  console.log('✅ Found fetchAndConvertToBase64 function');
} else {
  console.log('❌ fetchAndConvertToBase64 function not found');
}

// Check for requiresBase64Conversion function
if (distContent.includes('requiresBase64Conversion')) {
  console.log('✅ Found requiresBase64Conversion function');
} else {
  console.log('❌ requiresBase64Conversion function not found');
}

// Check if OpenAI is marked as requiring base64
if (distContent.includes('provider === "openai"') || distContent.includes('provider === \'openai\'')) {
  console.log('✅ Found OpenAI-specific conversion logic');
} else {
  console.log('❌ OpenAI-specific conversion logic not found');
}

// Check if the conversion is applied to documents
const conversionRegex = /if.*requiresBase64Conversion.*provider.*!.*fileUrl\.startsWith.*data:/s;
if (conversionRegex.test(distContent)) {
  console.log('✅ Found conditional base64 conversion for file URLs');
} else {
  console.log('⚠️  Conditional base64 conversion logic may not be properly integrated');
}

// Check if fetch is called to download URLs
if (distContent.includes('await fetch(url)') || distContent.includes('await fetch(') || distContent.includes('fetch(url)')) {
  console.log('✅ Found fetch call to download URLs');
} else {
  console.log('❌ No fetch call found for downloading URLs');
}

// Check if Buffer is used for base64 conversion
if (distContent.includes('Buffer.from') && distContent.includes('toString(\'base64\')')) {
  console.log('✅ Found Buffer-based base64 encoding');
} else {
  console.log('❌ Buffer-based base64 encoding not found');
}

// Check if data URLs are constructed properly
if (distContent.includes('data:${mediaType};base64,${base64}') || distContent.includes('data:') && distContent.includes(';base64,')) {
  console.log('✅ Found data URL construction');
} else {
  console.log('❌ Data URL construction not found');
}

console.log('\n' + '=' .repeat(70));
console.log('CHECKING IMPLEMENTATION DETAILS');
console.log('=' .repeat(70));

// Extract and display the actual conversion code
const pdfConversionRegex = /else if \(part\.type === "document"\) \{[^}]*\}/gs;
const matches = distContent.match(pdfConversionRegex);

if (matches && matches.length > 0) {
  console.log('\nFound PDF conversion implementation:');
  console.log('-'.repeat(40));
  matches.forEach((match, index) => {
    console.log(`\nImplementation ${index + 1}:`);
    // Clean up the minified code for readability
    const formatted = match
      .replace(/;/g, ';\n  ')
      .replace(/\{/g, ' {\n  ')
      .replace(/\}/g, '\n}');
    console.log(formatted);
  });
}

console.log('\n' + '=' .repeat(70));
console.log('SUMMARY');
console.log('=' .repeat(70));

// Check if all components are present
const hasConversion = distContent.includes('fetchAndConvertToBase64');
const hasProviderCheck = distContent.includes('requiresBase64Conversion');
const hasOpenAILogic = distContent.includes('provider === "openai"') || distContent.includes('provider === \'openai\'');

if (hasConversion && hasProviderCheck && hasOpenAILogic) {
  console.log('\n✅ SUCCESS: All base64 conversion components are present in the built SDK');
  console.log('\nThe SDK should now:');
  console.log('1. Check if the provider is OpenAI');
  console.log('2. Convert PDF URLs to base64 data URLs for OpenAI');
  console.log('3. Leave URLs as-is for other providers like Anthropic');
} else {
  console.log('\n⚠️  WARNING: Some base64 conversion components may be missing');
  console.log('\nMissing components:');
  if (!hasConversion) console.log('- fetchAndConvertToBase64 function');
  if (!hasProviderCheck) console.log('- requiresBase64Conversion function');
  if (!hasOpenAILogic) console.log('- OpenAI-specific logic');
}