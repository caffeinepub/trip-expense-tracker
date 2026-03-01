import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Runtime "mo:core/Runtime";
import Iter "mo:core/Iter";

import AccessControl "authorization/access-control";
import MixinAuthorization "authorization/MixinAuthorization";

// Use data migration function specified in with-clause to keep old state on upgrade

actor {
  let accessControlState = AccessControl.initState();
  include MixinAuthorization(accessControlState);

  type Expense = {
    id : Nat;
    date : Text;
    description : Text;
    location : Text;
    amount : Float;
    paidBy : Text;
  };

  var nextExpenseId = 1;
  let expenses = Map.empty<Nat, Expense>();

  public shared ({ caller }) func addExpense(
    date : Text,
    description : Text,
    location : Text,
    amount : Float,
    paidBy : Text,
  ) : async Nat {
    if (not AccessControl.hasPermission(accessControlState, caller, #user)) {
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
    if (not AccessControl.hasPermission(accessControlState, caller, #user)) {
      Runtime.trap("Unauthorized: Only users can view expenses");
    };
    expenses.values().toArray();
  };

  public shared ({ caller }) func resetExpenses() : async () {
    if (not AccessControl.hasPermission(accessControlState, caller, #user)) {
      Runtime.trap("Unauthorized: Only users can reset expenses");
    };
    expenses.clear();
    nextExpenseId := 1;
  };
};
