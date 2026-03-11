import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Array "mo:core/Array";
import Principal "mo:core/Principal";
import Runtime "mo:core/Runtime";
import MixinAuthorization "authorization/MixinAuthorization";
import MixinStorage "blob-storage/Mixin";
import AccessControl "authorization/access-control";


// Apply the migration from previous code

actor {
  // Include blob storage
  include MixinStorage();

  // Initialize the access control system
  let accessControlState = AccessControl.initState();
  include MixinAuthorization(accessControlState);

  // User profile type
  public type UserProfile = {
    name : Text;
  };

  // Expense type
  public type Expense = {
    id : Nat;
    date : Text;
    description : Text;
    location : Text;
    amount : Float;
    paidBy : Text;
  };

  // Itinerary entry type
  public type ItineraryEntry = {
    id : Text;
    date : Text;
    activity : Text;
    time : Text;
    hotelName : Text;
    hotelLocation : Text;
    details : Text;
    photoUrls : [Text];
  };

  // Persistent storage for user profiles, expenses, and itinerary entries
  var userProfiles : Map.Map<Principal, UserProfile> = Map.empty<Principal, UserProfile>();
  var expenses : Map.Map<Nat, Expense> = Map.empty<Nat, Expense>();
  var nextExpenseId = 1;
  var itineraryEntries : Map.Map<Text, ItineraryEntry> = Map.empty<Text, ItineraryEntry>();

  // User profile management functions
  public query ({ caller }) func getCallerUserProfile() : async ?UserProfile {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can view profiles");
    };
    userProfiles.get(caller);
  };

  public query ({ caller }) func getUserProfile(user : Principal) : async ?UserProfile {
    if (caller != user and not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Can only view your own profile");
    };
    userProfiles.get(user);
  };

  public shared ({ caller }) func saveCallerUserProfile(profile : UserProfile) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can save profiles");
    };
    userProfiles.add(caller, profile);
  };

  // Expense tracking functions
  public shared ({ caller }) func addExpense(
    date : Text,
    description : Text,
    location : Text,
    amount : Float,
    paidBy : Text,
  ) : async Nat {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can add expenses");
    };

    let id = nextExpenseId;
    nextExpenseId += 1;

    let expense : Expense = {
      id;
      date;
      description;
      location;
      amount;
      paidBy;
    };

    expenses.add(id, expense);

    id;
  };

  public query ({ caller }) func getExpenses() : async [Expense] {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can view expenses");
    };
    expenses.values().toArray();
  };

  public shared ({ caller }) func resetExpenses() : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #admin))) {
      Runtime.trap("Unauthorized: Only admins can reset expenses");
    };
    expenses := Map.empty<Nat, Expense>();
    nextExpenseId := 1;
  };

  // Itinerary management functions
  public shared ({ caller }) func addItineraryEntry(
    id : Text,
    date : Text,
    activity : Text,
    time : Text,
    hotelName : Text,
    hotelLocation : Text,
    details : Text,
    photoUrls : [Text],
  ) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can add itinerary entries");
    };

    let entry : ItineraryEntry = {
      id;
      date;
      activity;
      time;
      hotelName;
      hotelLocation;
      details;
      photoUrls;
    };

    itineraryEntries.add(id, entry);
  };

  public query ({ caller }) func getItineraryEntries() : async [ItineraryEntry] {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can view itinerary entries");
    };
    itineraryEntries.values().toArray();
  };

  public shared ({ caller }) func updateItineraryEntry(
    id : Text,
    date : Text,
    activity : Text,
    time : Text,
    hotelName : Text,
    hotelLocation : Text,
    details : Text,
    photoUrls : [Text],
  ) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can update itinerary entries");
    };

    switch (itineraryEntries.get(id)) {
      case (null) { Runtime.trap("Itinerary entry not found: " # id) };
      case (?_) {
        let updatedEntry : ItineraryEntry = {
          id;
          date;
          activity;
          time;
          hotelName;
          hotelLocation;
          details;
          photoUrls;
        };

        itineraryEntries.add(id, updatedEntry);
      };
    };
  };

  public shared ({ caller }) func deleteItineraryEntry(id : Text) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can delete itinerary entries");
    };

    switch (itineraryEntries.get(id)) {
      case (null) { Runtime.trap("Itinerary entry not found: " # id) };
      case (?_) {
        itineraryEntries.remove(id);
      };
    };
  };
};
