import type { Principal } from "@icp-sdk/core/principal";
export interface Some<T> {
    __kind__: "Some";
    value: T;
}
export interface None {
    __kind__: "None";
}
export type Option<T> = Some<T> | None;
export type List = Array<string>;
export interface Expense {
    id: bigint;
    date: string;
    description: string;
    currency: string;
    place: string;
    amount: number;
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
    addExpense(tripCode: string, description: string, amount: number, paidBy: string, date: string, place: string, currency: string): Promise<bigint>;
    assignCallerUserRole(user: Principal, role: UserRole): Promise<void>;
    deleteExpense(tripCode: string, id: bigint): Promise<boolean>;
    getCallerUserProfile(): Promise<UserProfile | null>;
    getCallerUserRole(): Promise<UserRole>;
    getExpenses(tripCode: string): Promise<Array<Expense>>;
    getMembers(tripCode: string): Promise<List>;
    getPlaces(tripCode: string): Promise<List>;
    getUserProfile(user: Principal): Promise<UserProfile | null>;
    isCallerAdmin(): Promise<boolean>;
    resetExpenses(tripCode: string): Promise<void>;
    saveCallerUserProfile(profile: UserProfile): Promise<void>;
    setMembers(tripCode: string, members: List): Promise<void>;
    setPlaces(tripCode: string, places: List): Promise<void>;
}
