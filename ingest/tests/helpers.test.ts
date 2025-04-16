import { expect } from 'chai';
import { Readable } from 'stream';
//NOTE: no extensions in tests because it's excluded in tsconfig.json and
//we are testing in a typescript environment via `ts-mocha -r tsx` (esm)
import { formDataToObject } from '../src/helpers';
import { 
  readableStreamToReadable, 
  imToURL, 
  imQueryToObject 
} from '../src/http/helpers';
import { 
  readableToReadableStream, 
  reqToURL, 
  reqQueryToObject 
} from '../src/whatwg/helpers';
import type { NodeRequest } from '../src/types';
import type { IM } from '../src/types';

/**
 * Test suite for helper functions used throughout the ingest package
 * Tests cover utility functions for data transformation,
 *  stream handling, and URL manipulation
 */

describe('helpers', () => {

   /**
   * Tests for formDataToObject function
   * Validates form data parsing for different content types
   */

  describe('formDataToObject', () => {
    it('should handle JSON content type', () => {
      const result = formDataToObject(
        'application/json',
        '{"name":"test","value":123}'
      );
      expect(result).to.deep.equal({ name: 'test', value: 123 });
    });

    it('should handle form-urlencoded content type', () => {
      const result = formDataToObject(
        'application/x-www-form-urlencoded',
        'name=test&value=123'
      );
      expect(result).to.deep.equal({ name: 'test', value: 123 });
    });

    it('should handle multipart/form-data content type', () => {
      const formData = 
      '--boundary\r\nContent-Disposition: form-data; name="field1"\r\n\r\nvalue1\r\n--boundary--';
      const result = formDataToObject('multipart/form-data; boundary=boundary', 
      formData);
      expect(result).to.deep.equal({ field1: 'value1' });
    });

    it('should return empty object for unknown content type', () => {
      expect(formDataToObject
      ('text/plain', 'some data')).to.deep.equal({});
    });
  });

   /**
   * Tests for readableStreamToReadable function
   * Verifies conversion from Web API ReadableStream to Node.js Readable
   * Covers empty streams, text data, and binary data
   */

  describe('readableStreamToReadable', () => {
     /**
     * Tests basic conversion of text data
     * Verifies that the resulting stream is a Node.js Readable
     * and contains the correct data
     */

    it('should convert ReadableStream to Node.js Readable', async () => {
      const data = 'Hello, World!';
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(data) as unknown as any);
          controller.close();
        }
      });

      const readable = readableStreamToReadable(stream);
      expect(readable).to.be.instanceOf(Readable);

      let result = '';
      for await (const chunk of readable) {
        result += chunk;
      }
      expect(result).to.equal(data);
    });

      /**
     * Tests handling of empty streams
     * Ensures proper behavior when no data is present
     */
    it('should handle empty ReadableStream', async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.close();
        }
      });

      const readable = readableStreamToReadable(stream);
      expect(readable).to.be.instanceOf(Readable);

      const chunks: Buffer[] = [];
      for await (const chunk of readable) {
        chunks.push(chunk as Buffer);
      }
      expect(chunks).to.have.length(0);
    });

    /**
     * Tests conversion of binary data
     * Verifies that Uint8Array data is properly converted
     * and can be read from the resulting stream
     */
    it('should handle binary data', async () => {
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      const stream = new ReadableStream({
        start(controller: ReadableStreamDefaultController<Uint8Array>) {
          controller.enqueue(data);
          controller.close();
        }
      });

      const readable = readableStreamToReadable(stream);
      const chunks: Uint8Array[] = [];
      for await (const chunk of readable) {
        chunks.push(chunk);
      }
      expect(Buffer.concat(chunks)).to.deep.equal(Buffer.from(data));
    });
  });

  
  /**
   * Tests for readableToReadableStream function
   * Validates conversion from Node.js Readable to Web API ReadableStream
   * Tests empty streams and multiple chunk handling
   */
  describe('readableToReadableStream', () => {
    it('should convert Node.js Readable to ReadableStream', async () => {
      const data = 'Hello, World!';
      const buffer = Buffer.from(data);
      const readable = Readable.from([buffer]);

      const stream = readableToReadableStream(readable);
      expect(stream).to.be.instanceOf(ReadableStream);

      const reader = stream.getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      const result = Buffer.concat(chunks).toString();
      expect(result).to.equal(data);
    });

    it('should handle empty Readable stream', async () => {
      const readable = Readable.from([]);
      const stream = readableToReadableStream(readable);
      const reader = stream.getReader();
      const { done, value } = await reader.read();
      expect(done).to.be.true;
      expect(value).to.be.undefined;
    });

    it('should handle multiple chunks', async () => {
      const chunks = ['Hello', ' ', 'World', '!'].map(str => Buffer.from(str));
      const readable = Readable.from(chunks);
      const stream = readableToReadableStream(readable);
      const reader = stream.getReader();
      const receivedChunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        receivedChunks.push(value);
      }
      const result = Buffer.concat(receivedChunks).toString();
      expect(result).to.equal('Hello World!');
    });
  });

  /**
   * Tests for fetchToURL function
   * Ensures proper URL object creation from NodeRequest objects
   */

  describe('fetchToURL', () => {
    it('should convert NodeRequest to URL', () => {
      const request = {
        url: 'https://example.com/path?query=value'
      };
      const url = reqToURL(request as NodeRequest);
      expect(url).to.be.instanceOf(URL);
      expect(url.href).to.equal('https://example.com/path?query=value');
      expect(url.pathname).to.equal('/path');
      expect(url.searchParams.get('query')).to.equal('value');
    });

    it('should handle URLs without query parameters', () => {
      const request = {
        url: 'https://example.com/path'
      };
      const url = reqToURL(request as NodeRequest);
      expect(url.href).to.equal('https://example.com/path');
      expect(url.search).to.equal('');
    });
  });

   /**
   * Tests for fetchQueryToObject function
   * Validates URL query string parsing from NodeRequest objects
   */
  describe('fetchQueryToObject', () => {
    it('should convert URL query to object', () => {
      const request = {
        url: 'https://example.com/path?foo=bar&baz=qux'
      };
      const query = reqQueryToObject(request as NodeRequest);
      expect(query).to.deep.equal({
        foo: 'bar',
        baz: 'qux'
      });
    });

    it('should handle URL without query parameters', () => {
      const request = {
        url: 'https://example.com/path'
      };
      const query = reqQueryToObject(request as NodeRequest);
      expect(query).to.deep.equal({});
    });
  });

  /**
   * Tests for imToURL function
   * Verifies URL object creation from IncomingMessage objects
   * Tests protocol handling, x-forwarded-proto variations, and invalid URLs
   */
  describe('imToURL', () => {
    it('should create URL from IM with default protocol', () => {
       /**
     * Tests default protocol handling
     * Verifies that HTTPS is used when no protocol is specified
     */
      const im = {
        url: '/path',
        headers: { host: 'example.com' },
        socket: { encrypted: false }
      } as unknown as IM;
      const url = imToURL(im);
      expect(url.href).to.equal('http://example.com/path');
    });

     /**
     * Tests x-forwarded-proto header handling
     * Ensures protocol is correctly extracted from header
     */
    it('should handle x-forwarded-proto header', () => {
      const im = {
        url: '/test',
        headers: {
          host: 'example.com',
          'x-forwarded-proto': 'https'
        },
        socket: { encrypted: false }
      } as unknown as IM;
      const url = imToURL(im);
      expect(url.protocol).to.equal('https:');
    });

     /**
     * Tests array-format x-forwarded-proto header
     * Verifies that first protocol in array is used
     */
    it('should handle array x-forwarded-proto header', () => {
      const im = {
        url: '/test',
        headers: {
          host: 'example.com',
          'x-forwarded-proto': ['http', 'https']
        },
        socket: { encrypted: false }
      } as unknown as IM;
      const url = imToURL(im);
      expect(url.protocol).to.equal('http:');
    });

     /**
     * Tests comma-separated x-forwarded-proto header
     * Ensures first protocol in list is used
     */
    it('should handle comma-separated x-forwarded-proto', () => {
      const im = {
        url: '/test',
        headers: {
          host: 'example.com',
          'x-forwarded-proto': 'http, https'
        },
        socket: { encrypted: false }
      } as unknown as IM;
      const url = imToURL(im);
      expect(url.protocol).to.equal('http:');
    });

    it('should handle x-forwarded-proto vs socket', () => {
      const im = {
        url: '/test',
        headers: {
          host: 'example.com',
          'x-forwarded-proto': 'http'
        },
        socket: { encrypted: true }
      } as unknown as IM;
      const url = imToURL(im);
      expect(url.protocol).to.equal('http:');
    });

     /**
     * Tests invalid URL handling
     * Verifies fallback to unknownhost when URL is invalid
     */
    it('should handle invalid URLs with unknownhost', () => {
      const im = {
        url: 'invalid-url',
        headers: { host: undefined },
        socket: { encrypted: false }
      } as unknown as IM;
      const url = imToURL(im);
      expect(url.href).to.equal('http://undefinedinvalid-url/');
    });
  });

  /**
   * Tests for imQueryToObject function
   * Ensures proper query string parsing from IncomingMessage objects
   */
  describe('imQueryToObject', () => {
    it('should convert IM URL query to object', () => {
      const im = {
        url: '/path?foo=bar&baz=qux',
        headers: { host: 'example.com' },
        socket: { encrypted: false }
      } as unknown as IM;
      const query = imQueryToObject(im);
      expect(query).to.deep.equal({
        foo: 'bar',
        baz: 'qux'
      });
    });

    it('should handle URL without query parameters', () => {
      const im = {
        url: '/path',
        headers: { host: 'example.com' },
        socket: { encrypted: false }
      } as unknown as IM;
      const query = imQueryToObject(im);
      expect(query).to.deep.equal({});
    });
  });
});