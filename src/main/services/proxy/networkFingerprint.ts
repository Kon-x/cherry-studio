import os from 'node:os'

/**
 * Fingerprint of the machine's external network interfaces.
 *
 * A change means the network path was rebuilt underneath the app — a VPN or game
 * accelerator raising/dropping a TUN adapter, a Wi-Fi ↔ Ethernet switch, a DHCP
 * re-lease. Chromium's network service keeps sockets and DNS entries that such a
 * change silently invalidates, so this is what triggers a forced proxy re-apply.
 *
 * Internal (loopback) addresses are excluded: they never change, and a local
 * proxy listening on one is reached through whatever route the change installed.
 * Entries are sorted so the OS enumeration order can't fake a change.
 */
export function networkInterfacesFingerprint(
  interfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]> = os.networkInterfaces()
): string {
  const entries: string[] = []
  for (const [name, addresses] of Object.entries(interfaces)) {
    for (const address of addresses ?? []) {
      if (address.internal) continue
      entries.push(`${name}|${address.family}|${address.address}|${address.netmask}`)
    }
  }
  return entries.sort().join(';')
}
