

* New restriction: No two sync groups may have the same target directory ??
* We need some test that syncs only part of a directory/tree
* We need a test to make sure that files inside non-covered subdirectories are not inspected.
* Change: The state should reflect the type of file (symlink or regular file) for each entry, so that 
  it does not consider the symlink to "./file.txt" to be the same as a file with the contents "./file.txt"
