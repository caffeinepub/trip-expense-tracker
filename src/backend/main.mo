import Nat "mo:core/Nat";
import Array "mo:core/Array";
import VarArray "mo:core/VarArray";
import Iter "mo:core/Iter";
import Text "mo:core/Text";
import Runtime "mo:core/Runtime";
import Principal "mo:core/Principal";
import MixinStorage "blob-storage/Mixin";
import MixinAuthorization "authorization/MixinAuthorization";
import AccessControl "authorization/access-control";



actor {
  // Expense type
  public type Expense = {
    id : Nat;
    description : Text;
    amount : Float;
    paidBy : Text;
    date : Text;
    place : Text;
    currency : Text;
  };

  // User profile type
  public type UserProfile = {
    name : Text;
  };

  // List type
  public type List = [Text];

  // Persistent storage for expenses and next expense id
  var persistentExpenses : [(Text, Expense)] = [];
  var persistentNextExpenseId : Nat = 1;
  var persistentMembers : [(Text, List)] = [];
  var persistentPlaces : [(Text, List)] = [];
  var persistentUserProfiles : [(Principal, UserProfile)] = [];

  // Initialize access control
  let accessControlState = AccessControl.initState();
  include MixinAuthorization(accessControlState);
  include MixinStorage();

  // Default lists
  let defaultMembers : List = ["Manoj", "Ramesh", "Abhijit", "Pradeep"];
  let defaultPlaces : List = ["Bangkok", "Phu Quoc", "Phuket", "Phi Phi Island"];

  // Expense management functions
  public shared ({ caller }) func addExpense(tripCode : Text, description : Text, amount : Float, paidBy : Text, date : Text, place : Text, currency : Text) : async Nat {
    if (not (AccessControl.hasPermission(accessControlState, caller, #guest))) {
      Runtime.trap("Unauthorized: Only users can add expenses");
    };

    let id = persistentNextExpenseId;
    persistentNextExpenseId := persistentNextExpenseId + 1;

    let expense : Expense = {
      id;
      description;
      amount;
      paidBy;
      date;
      place;
      currency;
    };

    persistentExpenses := persistentExpenses.concat([(tripCode.toUpper(), expense)]);
    id;
  };

  public query ({ caller }) func getExpenses(tripCode : Text) : async [Expense] {
    if (not (AccessControl.hasPermission(accessControlState, caller, #guest))) {
      Runtime.trap("Unauthorized: Only users can view expenses");
    };

    persistentExpenses.filter(
      func((tc, _)) { tc == tripCode.toUpper() }
    ).map(
      func((_, exp)) { exp }
    );
  };

  public shared ({ caller }) func deleteExpense(tripCode : Text, id : Nat) : async Bool {
    if (not (AccessControl.hasPermission(accessControlState, caller, #guest))) {
      Runtime.trap("Unauthorized: Only users can delete expenses");
    };

    let originalLength = persistentExpenses.size();
    persistentExpenses := persistentExpenses.filter(
      func((tc, exp)) { not (tc == tripCode.toUpper() and exp.id == id) }
    );
    persistentExpenses.size() < originalLength;
  };

  public shared ({ caller }) func resetExpenses(tripCode : Text) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #guest))) {
      Runtime.trap("Unauthorized: Only users can reset expenses");
    };

    persistentExpenses := persistentExpenses.filter(
      func((tc, _)) { tc != tripCode.toUpper() }
    );
  };

  // List management functions
  public query ({ caller }) func getMembers(tripCode : Text) : async List {
    if (not (AccessControl.hasPermission(accessControlState, caller, #guest))) {
      Runtime.trap("Unauthorized: Only users can view members");
    };

    switch (
      persistentMembers.find(
        func((tc, _)) { tc == tripCode.toUpper() }
      )
    ) {
      case (null) { defaultMembers };
      case (?(_, members)) { members };
    };
  };

  public shared ({ caller }) func setMembers(tripCode : Text, members : List) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #guest))) {
      Runtime.trap("Unauthorized: Only users can set members");
    };

    persistentMembers := persistentMembers.filter(
      func((tc, _)) { tc != tripCode.toUpper() }
    ).concat([(tripCode.toUpper(), members)]);
  };

  public query ({ caller }) func getPlaces(tripCode : Text) : async List {
    if (not (AccessControl.hasPermission(accessControlState, caller, #guest))) {
      Runtime.trap("Unauthorized: Only users can view places");
    };

    switch (
      persistentPlaces.find(
        func((tc, _)) { tc == tripCode.toUpper() }
      )
    ) {
      case (null) { defaultPlaces };
      case (?(_, places)) { places };
    };
  };

  public shared ({ caller }) func setPlaces(tripCode : Text, places : List) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #guest))) {
      Runtime.trap("Unauthorized: Only users to set places");
    };

    persistentPlaces := persistentPlaces.filter(
      func((tc, _)) { tc != tripCode.toUpper() }
    ).concat([(tripCode.toUpper(), places)]);
  };

  // User profile management functions
  public query ({ caller }) func getCallerUserProfile() : async ?UserProfile {
    if (not (AccessControl.hasPermission(accessControlState, caller, #guest))) {
      Runtime.trap("Unauthorized: Only users can view profiles");
    };

    switch (persistentUserProfiles.find(func((p, _)) { p == caller })) {
      case (null) { null };
      case (?(_, profile)) { ?profile };
    };
  };

  public query ({ caller }) func getUserProfile(user : Principal) : async ?UserProfile {
    if (caller != user and not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Can only view your own profile");
    };

    switch (persistentUserProfiles.find(func((p, _)) { p == user })) {
      case (null) { null };
      case (?(_, profile)) { ?profile };
    };
  };

  public shared ({ caller }) func saveCallerUserProfile(profile : UserProfile) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #guest))) {
      Runtime.trap("Unauthorized: Only users can save profiles");
    };

    persistentUserProfiles := persistentUserProfiles.filter(
      func((p, _)) { p != caller }
    ).concat([(caller, profile)]);
  };
};
