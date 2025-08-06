# Google Cloud Authentication Setup

This guide helps you configure `GOOGLE_APPLICATION_CREDENTIALS` via a `.env` file to authenticate with Google Cloud APIs using a Service Account key.

---

## 🔐 Step 1: Create a Service Account Key

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Select or create a project.
3. Navigate to **IAM & Admin → Service Accounts**
4. Click **“+ CREATE SERVICE ACCOUNT”**
5. Enter a name and description.
6. Click **Create and Continue**
7. Assign roles (e.g., `Editor`, `Vertex AI User`, `Storage Admin`, etc.)
8. Click **Done**
9. In the list, find your new service account → click the 3-dot menu → **Manage Keys**
10. Click **ADD KEY → Create new key → JSON → Create**
11. Save the `.json` file securely in your project directory.

---

## 💾 Step 2: Save the Key File

Create a `keys/` directory and move the key file there:

```bash
mkdir -p keys/
mv ~/Downloads/my-service-account-key.json keys/
