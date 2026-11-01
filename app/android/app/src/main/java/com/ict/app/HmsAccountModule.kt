package com.ict.app

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.huawei.hmf.tasks.Task
import com.huawei.hms.support.account.AccountAuthManager
import com.huawei.hms.support.account.request.AccountAuthParams
import com.huawei.hms.support.account.request.AccountAuthParamsHelper
import com.huawei.hms.support.account.result.AuthAccount
import com.huawei.hms.support.api.entity.common.CommonConstant

/**
 * Android Account Kit 授权码获取（依赖 com.huawei.hms:hwid:6.x）。
 * 未构建验证：本机无 Android SDK / JDK 17。
 */
class HmsAccountModule(private val context: ReactApplicationContext) :
    ReactContextBaseJavaModule(context) {

    override fun getName(): String = "HmsAccountModule"

    @ReactMethod
    fun requestAuthCode(options: ReadableMap, promise: Promise) {
        val activity = currentActivity
        if (activity == null) {
            promise.reject("E_ACCOUNT_KIT", "activity unavailable")
            return
        }
        val params: AccountAuthParams = AccountAuthParamsHelper(AccountAuthParams.DEFAULT_AUTH_REQUEST_PARAM)
            .setAuthorizationCode()
            .createParams()
        val service = AccountAuthManager.getService(activity, params)
        val task: Task<AuthAccount> = service.signIn()
        task.addOnSuccessListener { account ->
            val result = Arguments.createMap()
            result.putString("code", account.authorizationCode)
            promise.resolve(result)
        }.addOnFailureListener { e ->
            val result = Arguments.createMap()
            if (e is com.huawei.hms.common.ApiException &&
                e.statusCode == CommonConstant.RETCODE.SIGN_IN_CANCELLED
            ) {
                result.putBoolean("cancelled", true)
            } else {
                result.putString("error", e.message ?: "account kit error")
            }
            promise.resolve(result)
        }
    }
}