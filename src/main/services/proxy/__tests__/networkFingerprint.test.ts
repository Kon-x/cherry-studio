import type os from 'node:os'

import { describe, expect, it } from 'vitest'

import { networkInterfacesFingerprint } from '../networkFingerprint'

const address = (
  overrides: Partial<os.NetworkInterfaceInfo> & Pick<os.NetworkInterfaceInfo, 'address'>
): os.NetworkInterfaceInfo =>
  ({
    family: 'IPv4',
    netmask: '255.255.255.0',
    mac: '00:00:00:00:00:00',
    internal: false,
    cidr: null,
    ...overrides
  }) as os.NetworkInterfaceInfo

describe('networkInterfacesFingerprint', () => {
  it('changes when a VPN/accelerator adapter appears', () => {
    const before = { 'Wi-Fi': [address({ address: '192.168.1.20' })] }
    const after = {
      'Wi-Fi': [address({ address: '192.168.1.20' })],
      'TAP-Accelerator': [address({ address: '10.8.0.2', netmask: '255.255.255.255' })]
    }

    expect(networkInterfacesFingerprint(after)).not.toBe(networkInterfacesFingerprint(before))
  })

  it('changes when the same adapter is re-addressed by a DHCP re-lease', () => {
    const before = { 'Wi-Fi': [address({ address: '192.168.1.20' })] }
    const after = { 'Wi-Fi': [address({ address: '192.168.1.37' })] }

    expect(networkInterfacesFingerprint(after)).not.toBe(networkInterfacesFingerprint(before))
  })

  it('changes when a netmask changes but the address does not', () => {
    const before = { 'Wi-Fi': [address({ address: '192.168.1.20', netmask: '255.255.255.0' })] }
    const after = { 'Wi-Fi': [address({ address: '192.168.1.20', netmask: '255.255.0.0' })] }

    expect(networkInterfacesFingerprint(after)).not.toBe(networkInterfacesFingerprint(before))
  })

  it('is stable when the OS enumerates the same interfaces in another order', () => {
    const wifi = [address({ address: '192.168.1.20' })]
    const tun = [address({ address: '10.8.0.2' })]

    expect(networkInterfacesFingerprint({ 'Wi-Fi': wifi, tun0: tun })).toBe(
      networkInterfacesFingerprint({ tun0: tun, 'Wi-Fi': wifi })
    )
  })

  it('ignores loopback so a local proxy address is not mistaken for a path change', () => {
    const withLoopback = {
      'Wi-Fi': [address({ address: '192.168.1.20' })],
      'Loopback Pseudo-Interface 1': [address({ address: '127.0.0.1', internal: true })]
    }

    expect(networkInterfacesFingerprint(withLoopback)).toBe(
      networkInterfacesFingerprint({ 'Wi-Fi': [address({ address: '192.168.1.20' })] })
    )
  })
})
