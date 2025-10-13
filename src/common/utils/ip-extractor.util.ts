// src/common/utils/ip-extractor.util.ts
export class IpExtractorUtil {
  static getClientIp(req: any): string {
    // Priority order for IP extraction
    const headers = [
      'x-forwarded-for',
      'x-real-ip',
      'cf-connecting-ip',
      'fastly-client-ip',
      'x-client-ip',
      'x-cluster-client-ip',
    ];

    // Check all proxy headers
    for (const header of headers) {
      const value = req.headers[header];
      if (value) {
        // Handle comma-separated IPs (take first one)
        const ip = value.split(',')[0].trim();
        if (ip && this.isValidIp(ip)) {
          return ip;
        }
      }
    }

    // Fall back to direct connection
    let ip = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress;

    // Convert IPv6 loopback to IPv4
    if (ip === '::1' || ip === '::ffff:127.0.0.1') {
      return '127.0.0.1';
    }

    // Remove IPv6 prefix if present
    if (ip?.startsWith('::ffff:')) {
      ip = ip.substring(7);
    }

    return ip || 'unknown';
  }

  static isValidIp(ip: string): boolean {
    // Basic IPv4 validation
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    // Basic IPv6 validation
    const ipv6Regex = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
    
    return ipv4Regex.test(ip) || ipv6Regex.test(ip);
  }

  static getLocationFromIp(ip: string): string {
    // For localhost
    if (ip === '127.0.0.1' || ip === 'localhost') {
      return 'Local Development';
    }

    // For production, you can integrate with IP geolocation APIs
    // Example: ipapi.co, ip-api.com, etc.
    return 'Unknown Location';
  }
}
