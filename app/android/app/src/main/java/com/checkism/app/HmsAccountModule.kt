package com.checkism.app

import android.app.Activity
import android.content.Intent
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.huawei.hmf.tasks.Task
import com.huawei.hms.common.ApiException
import com.huawei.hms.support.account.AccountAuthManager
import com.huawei.hms.support.account.request.AccountAuthParams
import com.huawei.hms.support.account.request.AccountAuthParamsHelper
import com.huawei.hms.support.account.result.AuthAccount
import com.huawei.hms.support.api.entity.common.CommonConstant

/**
 * Android Account Kit 授权码获取。
 *
 * Account Kit 6.15 的 AccountAuthService 不再暴露 signIn()，改为：
 * getSignInIntent() → startActivityForResult → parseAuthResultFromIntent()。
 */
class HmsAccountModule(private val context: ReactApplicationContext) :
    ReactContextBaseJavaModule(context) {

    private var pending: Promise? = null

    private val tag = "HMSLogin"

    private val activityListener = object : BaseActivityEventListener() {
        override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
            if (requestCode != REQUEST_CODE) {
                return
            }
            val promise = pending ?: return
            pending = null
            Log.i(tag, "onActivityResult resultCode=$resultCode")
            if (data == null) {
                resolveError(promise, "empty account kit result")
                return
            }
            val task: Task<AuthAccount> = AccountAuthManager.parseAuthResultFromIntent(data)
            task.addOnSuccessListener { account ->
                val code = account.authorizationCode
                if (code.isNullOrEmpty()) {
                    resolveError(promise, "empty authorization code")
                } else {
                    Log.i(tag, "authorization code received, length=${code.length}")
                    val result = Arguments.createMap()
                    result.putString("code", code)
                    promise.resolve(result)
                }
            }.addOnFailureListener { error ->
                val status = (error as? ApiException)?.statusCode
                Log.e(tag, "account kit failed status=$status message=${error.message}", error)
                val result = Arguments.createMap()
                if (error is ApiException &&
                    error.statusCode == CommonConstant.RETCODE.SIGN_IN_CANCELLED
                ) {
                    result.putBoolean("cancelled", true)
                } else {
                    result.putString("error", if (status != null) "status=$status ${error.message}" else (error.message ?: "account kit error"))
                }
                promise.resolve(result)
            }
        }
    }

    init {
        context.addActivityEventListener(activityListener)
    }

    override fun getName(): String = "HmsAccountModule"

    @ReactMethod
    fun requestAuthCode(options: ReadableMap, promise: Promise) {
        val activity = currentActivity
        if (activity == null) {
            promise.reject("E_ACCOUNT_KIT", "activity unavailable")
            return
        }
        if (pending != null) {
            promise.reject("E_ACCOUNT_KIT", "account kit request already in progress")
            return
        }
        try {
            Log.i(tag, "requestAuthCode start")
            val params: AccountAuthParams =
                AccountAuthParamsHelper(AccountAuthParams.DEFAULT_AUTH_REQUEST_PARAM)
                    .setAuthorizationCode()
                    .createParams()
            val service = AccountAuthManager.getService(activity, params)
            pending = promise
            activity.startActivityForResult(service.signInIntent, REQUEST_CODE)
        } catch (error: Throwable) {
            pending = null
            Log.e(tag, "requestAuthCode failed", error)
            resolveError(promise, "native=${error.javaClass.simpleName}: ${error.message}")
        }
    }

    private fun resolveError(promise: Promise, message: String) {
        Log.e(tag, "resolveError: $message")
        val result = Arguments.createMap()
        result.putString("error", message)
        promise.resolve(result)
    }

    companion object {
        private const val REQUEST_CODE = 0xAC01
    }
}
