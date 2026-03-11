import type { Principal } from "@icp-sdk/core/principal";
export interface Some<T> {
    __kind__: "Some";
    value: T;
}
export interface None {
    __kind__: "None";
}
export type Option<T> = Some<T> | None;
export interface ItineraryEntry {
    id: string;
    photoUrls: Array<string>;
    hotelName: string;
    date: string;
    time: string;
    details: string;
    hotelLocation: string;
    activity: string;
}
export interface Expense {
    id: bigint;
    date: string;
    description: string;
    amount: number;
    location: string;
    paidBy: string;
}
export interface UserProfile {
    name: string;
}
export enum UserRole {
    admin = "admin",
    user = "user",
    guest = "guest"
}
export interface backendInterface {
    addExpense(date: string, description: string, location: string, amount: number, paidBy: string): Promise<bigint>;
    addItineraryEntry(id: string, date: string, activity: string, time: string, hotelName: string, hotelLocation: string, details: string, photoUrls: Array<string>): Promise<void>;
    assignCallerUserRole(user: Principal, role: UserRole): Promise<void>;
    deleteItineraryEntry(id: string): Promise<void>;
    getCallerUserProfile(): Promise<UserProfile | null>;
    getCallerUserRole(): Promise<UserRole>;
    getExpenses(): Promise<Array<Expense>>;
    getItineraryEntries(): Promise<Array<ItineraryEntry>>;
    getUserProfile(user: Principal): Promise<UserProfile | null>;
    isCallerAdmin(): Promise<boolean>;
    resetExpenses(): Promise<void>;
    saveCallerUserProfile(profile: UserProfile): Promise<void>;
    updateItineraryEntry(id: string, date: string, activity: string, time: string, hotelName: string, hotelLocation: string, details: string, photoUrls: Array<string>): Promise<void>;
}
