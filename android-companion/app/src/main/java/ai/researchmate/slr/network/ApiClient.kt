package ai.researchmate.slr.network

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST

data class AccountMeResponse(
    val user: UserSummary,
    val entitlement: EntitlementInfo
)

data class UserSummary(
    val uid: String,
    val email: String,
    val displayName: String,
    val role: String,
    val planCode: String,
    val aiCreditsBalance: Int
)

data class EntitlementInfo(
    val plan: PlanLimits,
    val subscription: SubscriptionState
)

data class PlanLimits(
    val code: String,
    val name: String,
    val maxProjects: Int,
    val monthlyAiCredits: Int,
    val storageQuotaMb: Int
)

data class SubscriptionState(
    val status: String,
    val provider: String
)

data class CloudProjectHeader(
    val id: Int,
    val localProjectId: String,
    val title: String,
    val discipline: String,
    val frameworkType: String,
    val articleCount: Int,
    val includedCount: Int,
    val version: Int,
    val lastSyncedDevice: String,
    val updatedAt: String
)

data class CloudProjectsResponse(val projects: List<CloudProjectHeader>)

data class CloudSyncRequest(
    val opId: String,
    val project: Map<String, Any>,
    val clientVersion: Int,
    val device: String = "android"
)

data class CloudSyncResponse(
    val synced: Boolean,
    val conflictDetected: Boolean,
    val version: Int,
    val updatedAt: String
)

interface ResearchMateApi {
    @GET("api/account/me")
    suspend fun getAccountOverview(@Header("Authorization") bearer: String): AccountMeResponse

    @GET("api/cloud/projects")
    suspend fun listCloudProjects(@Header("Authorization") bearer: String): CloudProjectsResponse

    @POST("api/cloud/sync")
    suspend fun syncProject(
        @Header("Authorization") bearer: String,
        @Body payload: CloudSyncRequest
    ): CloudSyncResponse
}
