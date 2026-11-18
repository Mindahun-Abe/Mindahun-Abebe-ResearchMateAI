package ai.researchmate.slr

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import ai.researchmate.slr.network.CloudProjectHeader
import ai.researchmate.slr.network.ResearchMateApi
import com.google.firebase.auth.FirebaseAuth
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory

class MainActivity : ComponentActivity() {
    private val auth by lazy { FirebaseAuth.getInstance() }
    private val api by lazy {
        Retrofit.Builder()
            .baseUrl(BuildConfig.API_BASE_URL)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(ResearchMateApi::class.java)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme(colorScheme = darkColorScheme()) {
                ResearchMateMobileApp(auth = auth, api = api)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ResearchMateMobileApp(auth: FirebaseAuth, api: ResearchMateApi) {
    val scope = rememberCoroutineScope()
    var currentUser by remember { mutableStateOf(auth.currentUser) }
    var projects by remember { mutableStateOf<List<CloudProjectHeader>>(emptyList()) }
    var syncStatus by remember { mutableStateOf("Synced") }
    var planBadge by remember { mutableStateOf("Free Starter") }
    var emailInput by remember { mutableStateOf("") }
    var passwordInput by remember { mutableStateOf("") }
    var errorMsg by remember { mutableStateOf("") }

    suspend fun loadCloudState() {
        val user = auth.currentUser ?: return
        syncStatus = "Synchronizing"
        try {
            val token = user.getIdToken(false).await().token ?: return
            val bearer = "Bearer $token"
            val account = api.getAccountOverview(bearer)
            planBadge = "${account.entitlement.plan.name} · ${account.user.aiCreditsBalance} AI credits"
            projects = api.listCloudProjects(bearer).projects
            syncStatus = "Synced"
        } catch (e: Exception) {
            syncStatus = "Offline"
            errorMsg = e.localizedMessage ?: "Offline mode active"
        }
    }

    LaunchedEffect(currentUser?.uid) {
        if (currentUser != null) loadCloudState()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("ResearchMate AI · $syncStatus") },
                actions = {
                    if (currentUser != null) {
                        TextButton(onClick = { scope.launch { loadCloudState() } }) {
                            Text("Sync")
                        }
                        TextButton(onClick = {
                            auth.signOut()
                            currentUser = null
                            projects = emptyList()
                        }) {
                            Text("Sign Out")
                        }
                    }
                }
            )
        }
    ) { padding ->
        Column(modifier = Modifier.padding(padding).padding(16.dp).fillMaxSize()) {
            if (currentUser == null) {
                Text("Sign In to Sync Research Projects", style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = emailInput,
                    onValueChange = { emailInput = it },
                    label = { Text("Researcher Email") },
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = passwordInput,
                    onValueChange = { passwordInput = it },
                    label = { Text("Password") },
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(Modifier.height(12.dp))
                Button(
                    onClick = {
                        scope.launch {
                            try {
                                auth.signInWithEmailAndPassword(emailInput.trim(), passwordInput).await()
                                currentUser = auth.currentUser
                                errorMsg = ""
                            } catch (e: Exception) {
                                errorMsg = e.localizedMessage ?: "Sign in failed"
                            }
                        }
                    },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Sign In")
                }
                if (errorMsg.isNotBlank()) {
                    Spacer(Modifier.height(8.dp))
                    Text(errorMsg, color = MaterialTheme.colorScheme.error)
                }
            } else {
                Text("Plan: $planBadge", style = MaterialTheme.typography.labelLarge)
                Spacer(Modifier.height(12.dp))
                LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    items(projects) { proj ->
                        Card(modifier = Modifier.fillMaxWidth()) {
                            Column(modifier = Modifier.padding(14.dp)) {
                                Text(proj.title, style = MaterialTheme.typography.titleSmall)
                                Spacer(Modifier.height(4.dp))
                                Text(
                                    "${proj.frameworkType} · ${proj.articleCount} articles · ${proj.includedCount} included · v${proj.version}",
                                    style = MaterialTheme.typography.bodySmall
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
