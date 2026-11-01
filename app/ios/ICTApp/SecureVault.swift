import Foundation
import React
import Security
import HMSAccount

/// iOS 安全存储：Keychain，kSecAttrAccessibleAfterFirstUnlock。
/// 未构建验证：本机无 macOS / Xcode。
@objc(SecureVaultModule)
final class SecureVaultModule: NSObject {

  private let service = "com.ict.app.vault"

  @objc static func requiresMainQueueSetup() -> Bool { false }

  @objc(get:resolver:rejecter:)
  func get(_ key: String,
           resolver resolve: @escaping RCTPromiseResolveBlock,
           rejecter reject: @escaping RCTPromiseRejectBlock) {
    var query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: key,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne
    ]
    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)
    if status == errSecItemNotFound {
      resolve(nil)
      return
    }
    guard status == errSecSuccess, let data = item as? Data,
          let value = String(data: data, encoding: .utf8) else {
      reject("E_VAULT_READ", "keychain read failed", nil)
      return
    }
    resolve(value)
  }

  @objc(set:value:resolver:rejecter:)
  func set(_ key: String,
           value: String,
           resolver resolve: @escaping RCTPromiseResolveBlock,
           rejecter reject: @escaping RCTPromiseRejectBlock) {
    let data = Data(value.utf8)
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: key
    ]
    SecItemDelete(query as CFDictionary)
    var attributes = query
    attributes[kSecValueData as String] = data
    attributes[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
    let status = SecItemAdd(attributes as CFDictionary, nil)
    if status == errSecSuccess {
      resolve(nil)
    } else {
      reject("E_VAULT_WRITE", "keychain write failed", nil)
    }
  }

  @objc(clear:resolver:rejecter:)
  func clear(_ key: String,
             resolver resolve: @escaping RCTPromiseResolveBlock,
             rejecter reject: @escaping RCTPromiseRejectBlock) {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: key
    ]
    SecItemDelete(query as CFDictionary)
    resolve(nil)
  }
}

/// iOS Account Kit：包装 HMSAccount，对外签名与 Android 一致。
@objc(HmsAccountModule)
final class HmsAccountModule: NSObject {

  @objc static func requiresMainQueueSetup() -> Bool { false }

  @objc(requestAuthCode:resolver:rejecter:)
  func requestAuthCode(_ options: [String: Any],
                       resolver resolve: @escaping RCTPromiseResolveBlock,
                       rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard let presenter = RCTPresentedViewController() else {
      resolve(["error": "no presenter"])
      return
    }
    let params = HUAWEIAccountAuthParamsHelper()
      .setAuthorizationCode()
      .createParams()
    let service = HUAWEIAccountAuthManager.getService(params)
    service.start(presenter) { result, error in
      if let error = error {
        resolve(["error": error.localizedDescription])
        return
      }
      if let account = result as? HUAWEIAuthAccount, let code = account.authorizationCode {
        resolve(["code": code])
      } else {
        resolve(["cancelled": true])
      }
    }
  }
}