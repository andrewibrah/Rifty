declare module "expo-sqlite/legacy" {
  export interface SQLResultSet {
    rows: {
      length: number;
      item: (index: number) => any;
      _array: any[];
    };
  }

  export interface SQLTransaction {
    executeSql(
      sqlStatement: string,
      args?: any[],
      callback?: (transaction: SQLTransaction, resultSet: SQLResultSet) => void,
      errorCallback?: (transaction: SQLTransaction, error: Error) => boolean
    ): void;
  }

  export interface SQLiteDatabase {
    transaction(
      callback: (transaction: SQLTransaction) => void,
      errorCallback?: (error: Error) => void,
      successCallback?: () => void
    ): void;
  }

  export function openDatabase(
    name: string,
    version?: string,
    description?: string,
    size?: number,
    callback?: (db: SQLiteDatabase) => void
  ): SQLiteDatabase;
}
