import { collection, getDocs, query, where } from "firebase/firestore";
import Papa from "papaparse";
import { auth, db } from "../firebase"; // ✅ use your initialized Firebase

export async function exportInventoryToCSV() {
  const user = auth.currentUser;
  if (!user) {
    alert("You must be signed in to export your inventory.");
    return;
  }

  try {
    // Filter only the current user's packs
    const packsRef = collection(db, "packs");
    const q = query(packsRef, where("ownerId", "==", user.uid));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      alert("No packs found in your inventory.");
      return;
    }

    // Convert snapshot data to plain objects
    const data: any[] = [];
    snapshot.forEach((doc) => {
      const pack = doc.data();
      data.push({
        "Firestore ID": doc.id,
        "Pack Name": pack.name || "",
        "Image URL": pack.imageUrl || "",
        "Available": pack.inPerson ?? 0,
        "In Transit": pack.inTransit ?? 0,
      });
    });

    // Sort the data alphabetically by "Pack Name"
    data.sort((a, b) => a["Pack Name"].localeCompare(b["Pack Name"]));

    // Convert to CSV
    const csv = Papa.unparse(data);

    // Trigger file download
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `mtg_inventory.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    console.log(`✅ Exported ${data.length} packs to CSV.`);
  } catch (error: any) {
    console.error("Error exporting inventory:", error);
    alert(`Failed to export inventory: ${error.message}`);
  }
}