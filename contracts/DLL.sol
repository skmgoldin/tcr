pragma solidity^0.4.11;

library DLL {
	struct Node {
		uint next;
		uint prev;
	}

	struct Data {
		mapping(uint => Node) dll;
	}

	function getNext(Data storage self, uint curr) returns (uint) {
		return self.dll[curr].next;
	}

	function getPrev(Data storage self, uint curr) returns (uint) {
		return self.dll[curr].prev;
	}

	function insert(Data storage self, uint prev, uint curr, uint next) {
		self.dll[curr].prev = prev;
		self.dll[curr].next = next;

		self.dll[prev].next = curr;
		self.dll[next].prev = curr;
	}

	function remove(Data storage self, uint curr) {
		uint next = getNext(self, curr);
		uint prev = getPrev(self, curr);

		self.dll[next].prev = prev;
		self.dll[prev].next = next;

		self.dll[curr].next = curr;
		self.dll[curr].prev = curr;
	}
}